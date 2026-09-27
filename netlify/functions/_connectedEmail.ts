import {
  auditIntegration,
  decryptSecret,
  encryptSecret,
  providerConfig,
  safeProviderError,
} from './_recruiterIntegrations'

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function encodeHeader(value: string) {
  return /[^\x20-\x7E]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
    : value
}

function emailHeader(value: string) {
  return String(value || '')
    .replace(/[\r\n]/g, ' ')
    .trim()
}

function gmailRawEmail(input: {
  from: string
  to: string
  replyTo?: string
  subject: string
  text: string
  html: string
}) {
  return [
    `From: ${emailHeader(input.from)}`,
    `To: ${emailHeader(input.to)}`,
    input.replyTo ? `Reply-To: ${emailHeader(input.replyTo)}` : '',
    `Subject: ${encodeHeader(emailHeader(input.subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary=career-unified-boundary',
    '',
    '--career-unified-boundary',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    input.text,
    '',
    '--career-unified-boundary',
    'Content-Type: text/html; charset=UTF-8',
    '',
    input.html,
    '',
    '--career-unified-boundary--',
  ]
    .filter(Boolean)
    .join('\r\n')
}

export async function refreshAccessToken(admin: any, record: any) {
  const provider = String(record.providerId || '')
  const config = providerConfig(provider)
  if (!config?.oauth || !record.encryptedRefreshTokenReference)
    throw new Error('refresh_token_unavailable')
  const prefix = config.envPrefix || ''
  const refreshToken = decryptSecret(record.encryptedRefreshTokenReference)
  const body = new URLSearchParams({
    client_id: String(process.env[`${prefix}_CLIENT_ID`] || ''),
    client_secret: String(process.env[`${prefix}_CLIENT_SECRET`] || ''),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const endpoint =
    config.oauth === 'google'
      ? 'https://oauth2.googleapis.com/token'
      : `https://login.microsoftonline.com/${encodeURIComponent(String(process.env.MICROSOFT_TENANT_ID || 'common'))}/oauth2/v2.0/token`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body,
  })
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) throw new Error(`refresh_token_${response.status}`)
  await admin
    .firestore()
    .doc(`recruiterIntegrations/${record.companyId}_${provider}`)
    .set(
      {
        encryptedAccessTokenReference: encryptSecret(String(payload.access_token)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        connectionStatus: 'connected',
        lastErrorCode: '',
        lastErrorAt: null,
      },
      {merge: true},
    )
  await auditIntegration(admin, {
    companyId: record.companyId,
    providerId: provider,
    action: 'token_refresh',
    status: 'connected',
  })
  return payload
}

async function accessToken(admin: any, record: any) {
  if (!record.encryptedAccessTokenReference) throw new Error('access_token_unavailable')
  return decryptSecret(record.encryptedAccessTokenReference)
}

async function providerFetch(
  admin: any,
  record: any,
  input: {url: string; method?: string; body?: unknown; headers?: Record<string, string>},
) {
  let token = await accessToken(admin, record)
  let response = await fetch(input.url, {
    method: input.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input.body ? {'Content-Type': 'application/json'} : {}),
      ...(input.headers || {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  })
  if (response.status === 401 && record.encryptedRefreshTokenReference) {
    let refreshed: any
    try {
      refreshed = await refreshAccessToken(admin, record)
    } catch (error) {
      const errorCode = safeProviderError(error)
      await admin
        .firestore()
        .doc(`recruiterIntegrations/${record.companyId}_${record.providerId}`)
        .set(
          {
            connectionStatus: 'needs_attention',
            lastErrorCode: errorCode,
            lastErrorAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        )
      await auditIntegration(admin, {
        companyId: record.companyId,
        providerId: record.providerId,
        action: 'token_refresh_failed',
        status: 'needs_attention',
        errorCode,
      })
      throw error
    }
    token = String(refreshed.access_token)
    response = await fetch(input.url, {
      method: input.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(input.body ? {'Content-Type': 'application/json'} : {}),
        ...(input.headers || {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    })
  }
  return response
}

export async function sendConnectedEmail(
  admin: any,
  record: any,
  input: {to: string; subject: string; text: string; html: string; replyTo?: string},
) {
  const provider = String(record.providerId || '')
  const config = providerConfig(provider)
  if (!config?.oauth || config.category !== 'email') throw new Error('email_provider_unavailable')
  if (provider === 'gmail') {
    const response = await providerFetch(admin, record, {
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      method: 'POST',
      body: {raw: encodeBase64Url(gmailRawEmail({from: record.providerEmail, ...input}))},
    })
    const payload: any = await response.json().catch(() => ({}))
    if (!response.ok)
      throw new Error(`gmail_send_${response.status}_${safeProviderError(payload.error)}`)
    return {
      providerMessageId: String(payload.id || ''),
      providerThreadId: String(payload.threadId || ''),
    }
  }
  const createResponse = await providerFetch(admin, record, {
    url: 'https://graph.microsoft.com/v1.0/me/messages',
    method: 'POST',
    body: {
      subject: input.subject,
      body: {contentType: 'HTML', content: input.html},
      toRecipients: [{emailAddress: {address: input.to}}],
      replyTo: input.replyTo ? [{emailAddress: {address: input.replyTo}}] : [],
    },
  })
  const draft: any = await createResponse.json().catch(() => ({}))
  if (!createResponse.ok || !draft.id) throw new Error(`graph_draft_${createResponse.status}`)
  const sendResponse = await providerFetch(admin, record, {
    url: `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}/send`,
    method: 'POST',
  })
  if (!sendResponse.ok) throw new Error(`graph_send_${sendResponse.status}`)
  return {providerMessageId: String(draft.id), providerThreadId: String(draft.conversationId || '')}
}
