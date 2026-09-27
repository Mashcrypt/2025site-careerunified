import type {Handler} from '@netlify/functions'
import {getAdmin} from './_firebaseAdmin'
import {checkRateLimit} from './_rateLimit'
import {
  ApplicationError,
  bearerToken,
  cleanText,
  corsHeaders,
  json,
  parseJsonBody,
} from './_applicationUtils'
import {
  decryptSecret,
  providerConfig,
  safeProviderError,
  assertIntegrationPermission,
} from './_recruiterIntegrations'

async function providerFetch(
  admin: any,
  record: any,
  input: {url: string; method?: string; body?: unknown; headers?: Record<string, string>},
) {
  if (!record.encryptedAccessTokenReference) throw new Error('access_token_unavailable')
  const token = decryptSecret(record.encryptedAccessTokenReference)
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
    const {refreshAccessToken} = await import('./_connectedEmail.js')
    try {
      const refreshed = await refreshAccessToken(admin, record)
      const newToken = String(refreshed.access_token)
      response = await fetch(input.url, {
        method: input.method || 'GET',
        headers: {
          Authorization: `Bearer ${newToken}`,
          ...(input.body ? {'Content-Type': 'application/json'} : {}),
          ...(input.headers || {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      })
    } catch {
      throw new Error('token_refresh_failed')
    }
  }
  return response
}

async function getGmailRecord(admin: any, companyId: string) {
  const snap = await admin.firestore().doc(`recruiterIntegrations/${companyId}_gmail`).get()
  if (!snap.exists) throw new ApplicationError(404, 'Gmail not connected.')
  const record = snap.data() || {}
  if (record.connectionStatus !== 'connected') {
    throw new ApplicationError(409, 'Gmail is not connected. Connect it in Integrations first.')
  }
  return record
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function gmailRawEmail(input: {
  from: string
  to: string
  replyTo?: string
  subject: string
  text: string
  html: string
}) {
  const emailHeader = (value: string) => String(value || '').replace(/[\r\n]/g, ' ').trim()
  const encodeHeader = (value: string) =>
    /[^\x20-\x7E]/.test(value)
      ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
      : value
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

function sanitizeHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin
  if (event.httpMethod === 'OPTIONS')
    return {statusCode: 200, headers: corsHeaders(origin), body: ''}

  try {
    const admin = getAdmin()
    const token = bearerToken(event)
    if (!token) throw new ApplicationError(401, 'Please log in.')

    let decoded: any
    try {
      decoded = await admin.auth().verifyIdToken(token)
    } catch {
      throw new ApplicationError(401, 'Your login session has expired. Please log in again.')
    }

    const companyId = cleanText(decoded.companyId || decoded.uid, 160)
    const body = parseJsonBody(event)
    const action = cleanText(body.action, 40).toLowerCase()
    
    // Check read permission for status action, manage permission for others
    if (action === 'status') {
      assertIntegrationPermission(decoded, companyId, 'read_email')
    } else {
      assertIntegrationPermission(decoded, companyId, 'send_email')
    }
    
    const record = await getGmailRecord(admin, companyId)

    const rateLimit = await checkRateLimit({
      admin,
      action: 'gmail-operations',
      identifier: `uid:${decoded.uid}`,
      limit: 60,
      windowSeconds: 60,
    })
    if (!rateLimit.allowed)
      return json(
        429,
        origin,
        {error: 'Too many Gmail requests. Please try again later.'},
        {'Retry-After': String(rateLimit.retryAfterSeconds)},
      )

    if (action === 'status') {
      return json(200, origin, {
        providerEmail: record.providerEmail,
        providerAccountId: record.providerAccountId,
        grantedScopes: record.grantedScopes || [],
        lastSyncAt: record.lastSyncAt?.toDate?.()?.toISOString?.() || record.lastSyncAt || '',
        connectionStatus: record.connectionStatus,
      })
    }

    if (action === 'send') {
      const to = cleanText(body.to, 254)
      const subject = cleanText(body.subject, 180)
      const text = cleanText(body.text, 5000)
      const html = cleanText(body.html, 10000)
      const replyTo = cleanText(body.replyTo || '', 254)
      const threadId = cleanText(body.threadId || '', 180)
      const inReplyTo = cleanText(body.inReplyTo || '', 180)

      if (!to || !subject || (!text && !html)) {
        throw new ApplicationError(400, 'Recipient, subject, and message body are required.')
      }

      const raw = gmailRawEmail({
        from: record.providerEmail,
        to,
        replyTo: replyTo || undefined,
        subject,
        text: text || '',
        html: sanitizeHtml(html || text || ''),
      })

      const sendBody: any = {raw: encodeBase64Url(raw)}
      if (threadId) sendBody.threadId = threadId

      const response = await providerFetch(admin, record, {
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        method: 'POST',
        body: sendBody,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`gmail_send_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        providerMessageId: String(payload.id || ''),
        providerThreadId: String(payload.threadId || ''),
      })
    }

    if (action === 'list') {
      const maxResults = Math.min(Math.max(Number(body.maxResults) || 50, 1), 100)
      const query = cleanText(body.query || '', 500)
      const pageToken = cleanText(body.pageToken || '', 200)
      const labelIds = Array.isArray(body.labelIds) ? body.labelIds.slice(0, 10) : []

      let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`
      if (query) url += `&q=${encodeURIComponent(query)}`
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`
      if (labelIds.length) url += `&labelIds=${labelIds.join(',')}`

      const response = await providerFetch(admin, record, {url})
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`gmail_list_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        messages: (payload.messages || []).map((m: any) => ({id: m.id, threadId: m.threadId})),
        nextPageToken: payload.nextPageToken || null,
        resultSizeEstimate: payload.resultSizeEstimate || 0,
      })
    }

    if (action === 'get') {
      const messageId = cleanText(body.messageId, 180)
      if (!messageId) throw new ApplicationError(400, 'Message ID is required.')

      const response = await providerFetch(admin, record, {
        url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`gmail_get_${response.status}_${safeProviderError(payload.error)}`)

      const headers: Record<string, string> = {}
      payload.payload?.headers?.forEach((h: any) => {
        headers[h.name.toLowerCase()] = h.value
      })

      let textBody = ''
      let htmlBody = ''
      const extractBody = (part: any) => {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          textBody = Buffer.from(part.body.data, 'base64').toString('utf8')
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          htmlBody = Buffer.from(part.body.data, 'base64').toString('utf8')
        } else if (part.parts) {
          part.parts.forEach(extractBody)
        }
      }
      extractBody(payload.payload)

      const attachments = (payload.payload?.parts || [])
        .filter((p: any) => p.filename && p.body?.attachmentId)
        .map((p: any) => ({
          attachmentId: p.body.attachmentId,
          filename: p.filename,
          mimeType: p.mimeType,
          size: p.body.size,
        }))

      return json(200, origin, {
        id: payload.id,
        threadId: payload.threadId,
        labelIds: payload.labelIds || [],
        snippet: payload.snippet || '',
        headers,
        textBody,
        htmlBody: sanitizeHtml(htmlBody),
        attachments,
        internalDate: payload.internalDate ? new Date(Number(payload.internalDate)).toISOString() : '',
      })
    }

    if (action === 'reply') {
      const messageId = cleanText(body.messageId, 180)
      const text = cleanText(body.text, 5000)
      const html = cleanText(body.html, 10000)
      const replyToAll = body.replyToAll === true

      if (!messageId) throw new ApplicationError(400, 'Message ID is required.')
      if (!text && !html) throw new ApplicationError(400, 'Reply body is required.')

      const originalMessage = await providerFetch(admin, record, {
        url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
      })
      const originalPayload: any = await originalMessage.json().catch(() => ({}))
      if (!originalMessage.ok) throw new Error('Failed to fetch original message for reply.')

      const headers: Record<string, string> = {}
      originalPayload.payload?.headers?.forEach((h: any) => {
        headers[h.name.toLowerCase()] = h.value
      })

      const threadId = originalPayload.threadId
      const subject = headers.subject || ''
      const inReplyTo = headers['message-id'] || ''
      const references = headers.references ? `${headers.references} ${inReplyTo}` : inReplyTo
      const toHeader = headers.from || ''

      const replySubject = subject.startsWith('Re: ') ? subject : `Re: ${subject}`

      const raw = gmailRawEmail({
        from: record.providerEmail,
        to: toHeader,
        subject: replySubject,
        text: text || '',
        html: sanitizeHtml(html || text || ''),
      })

      const sendBody: any = {
        raw: encodeBase64Url(raw),
        threadId,
      }

      const response = await providerFetch(admin, record, {
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        method: 'POST',
        body: sendBody,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`gmail_reply_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        providerMessageId: String(payload.id || ''),
        providerThreadId: String(payload.threadId || ''),
      })
    }

    if (action === 'modify') {
      const messageId = cleanText(body.messageId, 180)
      const addLabelIds = Array.isArray(body.addLabelIds) ? body.addLabelIds.slice(0, 10) : []
      const removeLabelIds = Array.isArray(body.removeLabelIds) ? body.removeLabelIds.slice(0, 10) : []

      if (!messageId) throw new ApplicationError(400, 'Message ID is required.')

      const response = await providerFetch(admin, record, {
        url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
        method: 'POST',
        body: {addLabelIds, removeLabelIds},
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`gmail_modify_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {id: payload.id, labelIds: payload.labelIds || []})
    }

    if (action === 'draft') {
      const to = cleanText(body.to, 254)
      const subject = cleanText(body.subject, 180)
      const text = cleanText(body.text, 5000)
      const html = cleanText(body.html, 10000)
      const replyTo = cleanText(body.replyTo || '', 254)
      const draftId = cleanText(body.draftId || '', 180)

      if (!to || !subject || (!text && !html)) {
        throw new ApplicationError(400, 'Recipient, subject, and message body are required.')
      }

      const raw = gmailRawEmail({
        from: record.providerEmail,
        to,
        replyTo: replyTo || undefined,
        subject,
        text: text || '',
        html: sanitizeHtml(html || text || ''),
      })

      const draftBody = {message: {raw: encodeBase64Url(raw)}}
      const url = draftId
        ? `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`
        : 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
      const method = draftId ? 'PUT' : 'POST'

      const response = await providerFetch(admin, record, {url, method, body: draftBody})
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`gmail_draft_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {draftId: payload.id, messageId: payload.message?.id || ''})
    }

    if (action === 'sync') {
      const since = body.since ? new Date(cleanText(body.since, 80)).getTime() : Date.now() - 7 * 24 * 60 * 60 * 1000
      const query = `after:${Math.floor(since / 1000)}`
      const maxResults = Math.min(Math.max(Number(body.maxResults) || 100, 1), 500)

      let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`
      const response = await providerFetch(admin, record, {url})
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`gmail_sync_${response.status}_${safeProviderError(payload.error)}`)

      const messages = (payload.messages || []).slice(0, maxResults)
      const detailed = await Promise.all(
        messages.map(async (m: any) => {
          try {
            const resp = await providerFetch(admin, record, {
              url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From,To,Subject,Date,Message-ID,References,In-Reply-To`,
            })
            const data = await resp.json().catch(() => ({}))
            if (!resp.ok) return null
            const headers: Record<string, string> = {}
            data.payload?.headers?.forEach((h: any) => {
              headers[h.name.toLowerCase()] = h.value
            })
            return {
              id: data.id,
              threadId: data.threadId,
              labelIds: data.labelIds || [],
              snippet: data.snippet || '',
              headers,
              internalDate: data.internalDate ? new Date(Number(data.internalDate)).toISOString() : '',
            }
          } catch {
            return null
          }
        }),
      )

      await admin
        .firestore()
        .doc(`recruiterIntegrations/${companyId}_gmail`)
        .set({lastSyncAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true})

      return json(200, origin, {
        messages: detailed.filter(Boolean),
        syncedAt: new Date().toISOString(),
      })
    }

    throw new ApplicationError(400, 'Unknown Gmail action.')
  } catch (error: any) {
    if (error instanceof ApplicationError)
      return json(error.statusCode, origin, {error: error.message})
    console.error('GMAIL_OPERATIONS_ERROR', safeProviderError(error))
    return json(500, origin, {error: 'The Gmail operation could not be completed.'})
  }
}
