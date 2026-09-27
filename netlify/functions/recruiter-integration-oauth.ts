import type {Handler} from '@netlify/functions'
import {getAdmin} from './_firebaseAdmin'
import {
  auditIntegration,
  callbackUrl,
  encryptSecret,
  oauthStateIsUsable,
  providerConfig,
  safeProviderError,
} from './_recruiterIntegrations'

function redirectUrl(providerId: string, result: string) {
  const site = String(
    process.env.URL || process.env.SITE_URL || 'https://careerunified.com',
  ).replace(/\/$/, '')
  return `${site}/recruiter-dashboard.html?integration=${encodeURIComponent(providerId)}&integration_result=${encodeURIComponent(result)}#integrations`
}

async function exchange(provider: 'google' | 'microsoft', code: string) {
  const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT'
  const body = new URLSearchParams({
    code,
    client_id: String(process.env[`${prefix}_CLIENT_ID`] || ''),
    client_secret: String(process.env[`${prefix}_CLIENT_SECRET`] || ''),
    redirect_uri: callbackUrl(provider),
    grant_type: 'authorization_code',
  })
  const endpoint =
    provider === 'google'
      ? 'https://oauth2.googleapis.com/token'
      : `https://login.microsoftonline.com/${encodeURIComponent(String(process.env.MICROSOFT_TENANT_ID || 'common'))}/oauth2/v2.0/token`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body,
  })
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) {
    const detail = String(payload.error || payload.error_description || '').trim()
    throw new Error(`token_exchange_${response.status}${detail ? `_${detail}` : ''}`)
  }
  return payload
}

async function profile(provider: 'google' | 'microsoft', accessToken: string) {
  const endpoint =
    provider === 'google'
      ? 'https://www.googleapis.com/oauth2/v2/userinfo'
      : 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName'
  const response = await fetch(endpoint, {headers: {Authorization: `Bearer ${accessToken}`}})
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = String(payload.error || payload.error_description || '').trim()
    throw new Error(`profile_${response.status}${detail ? `_${detail}` : ''}`)
  }
  return {
    accountId: String(payload.id || '').slice(0, 180),
    email: String(payload.email || payload.mail || payload.userPrincipalName || '').slice(0, 254),
  }
}

export const handler: Handler = async (event) => {
  const params = event.queryStringParameters || {}
  const code = String(params.code || '')
  const state = String(params.state || '')
  const error = String(params.error || '')
  const site = String(
    process.env.URL || process.env.SITE_URL || 'https://careerunified.com',
  ).replace(/\/$/, '')
  if (!state)
    return {
      statusCode: 302,
      headers: {
        Location: `${site}/recruiter-dashboard.html?integration=gmail&integration_result=invalid_state#integrations`,
      },
      body: '',
    }

  const admin = getAdmin()
  const db = admin.firestore()
  const stateHash = require('crypto').createHash('sha256').update(state).digest('hex')
  const stateRef = db.collection('recruiterIntegrationOAuthStates').doc(stateHash)
  const stateSnap = await stateRef.get()
  const stateRecord = stateSnap.data() || {}
  const providerId = String(stateRecord.providerId || '')
    .trim()
    .toLowerCase()
  if (!stateSnap.exists || !providerId || !oauthStateIsUsable(stateRecord, providerId)) {
    return {
      statusCode: 302,
      headers: {
        Location: `${site}/recruiter-dashboard.html?integration=${encodeURIComponent(providerId || 'gmail')}&integration_result=invalid_state#integrations`,
      },
      body: '',
    }
  }
  await stateRef.delete()

  if (error || !code) {
    await auditIntegration(admin, {
      companyId: stateRecord.companyId,
      providerId,
      userId: stateRecord.userId,
      action: 'oauth_denied',
      status: 'needs_attention',
      errorCode: 'permission_denied',
    })
    return {
      statusCode: 302,
      headers: {Location: redirectUrl(providerId, 'permission_denied')},
      body: '',
    }
  }

  try {
    const config = providerConfig(providerId)
    if (!config?.oauth) throw new Error('provider_not_oauth')
    const tokens = await exchange(config.oauth, code)
    const identity = await profile(config.oauth, tokens.access_token)
    const key = `${stateRecord.companyId}_${providerId}`
    await db
      .collection('recruiterIntegrations')
      .doc(key)
      .set(
        {
          companyId: stateRecord.companyId,
          providerId,
          providerAccountId: identity.accountId,
          providerEmail: identity.email,
          encryptedAccessTokenReference: encryptSecret(String(tokens.access_token)),
          encryptedRefreshTokenReference: tokens.refresh_token
            ? encryptSecret(String(tokens.refresh_token))
            : '',
          grantedScopes: String(tokens.scope || '')
            .split(/[ ,]+/)
            .filter(Boolean)
            .slice(0, 50),
          connectedByUserId: stateRecord.userId,
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSyncAt: null,
          connectionStatus: 'connected',
          lastErrorCode: '',
          lastErrorAt: null,
          metadataVersion: '1',
        },
        {merge: true},
      )
    await auditIntegration(admin, {
      companyId: stateRecord.companyId,
      providerId,
      userId: stateRecord.userId,
      action: 'oauth_connected',
      status: 'connected',
    })
    return {statusCode: 302, headers: {Location: redirectUrl(providerId, 'connected')}, body: ''}
  } catch (caught) {
    const codeValue = safeProviderError(caught)
    await db.collection('recruiterIntegrations').doc(`${stateRecord.companyId}_${providerId}`).set(
      {
        connectionStatus: 'needs_attention',
        lastErrorCode: codeValue,
        lastErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    await auditIntegration(admin, {
      companyId: stateRecord.companyId,
      providerId,
      userId: stateRecord.userId,
      action: 'oauth_failed',
      status: 'needs_attention',
      errorCode: codeValue,
    })
    console.error('RECRUITER_INTEGRATION_OAUTH_ERROR', codeValue)
    return {
      statusCode: 302,
      headers: {Location: redirectUrl(providerId, 'connection_failed')},
      body: '',
    }
  }
}
