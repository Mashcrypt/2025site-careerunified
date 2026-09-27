import crypto from 'crypto'
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
  PROVIDER_CONFIG,
  assertManagePermission,
  assertReadPermission,
  auditIntegration,
  callbackUrl,
  disconnectRecordPatch,
  providerConfig,
  providerConfigured,
  publicIntegrationRecord,
} from './_recruiterIntegrations'

function oauthUrl(providerId: string, state: string) {
  const config = providerConfig(providerId)
  if (!config?.oauth || !providerConfigured(providerId)) return ''
  const prefix = config.envPrefix || ''
  const params = new URLSearchParams()
  params.set('client_id', String(process.env[`${prefix}_CLIENT_ID`]))
  params.set('redirect_uri', callbackUrl(config.oauth))
  params.set('response_type', 'code')
  params.set('state', state)
  params.set('scope', (config.scopes || []).join(' '))
  if (config.oauth === 'google') {
    params.set('access_type', 'offline')
    params.set('prompt', 'consent')
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }
  params.set('response_mode', 'query')
  params.set('tenant', String(process.env.MICROSOFT_TENANT_ID || 'common'))
  return `https://login.microsoftonline.com/${encodeURIComponent(String(process.env.MICROSOFT_TENANT_ID || 'common'))}/oauth2/v2.0/authorize?${params}`
}

async function decodedUser(admin: any, event: any) {
  const token = bearerToken(event)
  if (!token) throw new ApplicationError(401, 'Please log in.')
  try {
    return await admin.auth().verifyIdToken(token)
  } catch {
    throw new ApplicationError(401, 'Your login session has expired. Please log in again.')
  }
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin
  if (event.httpMethod === 'OPTIONS')
    return {statusCode: 200, headers: corsHeaders(origin), body: ''}

  try {
    const admin = getAdmin()
    const decoded: any = await decodedUser(admin, event)
    const companyId = cleanText(decoded.companyId || decoded.uid, 160)
    if (event.httpMethod === 'GET') assertReadPermission(decoded, companyId)
    else assertManagePermission(decoded, companyId)
    const db = admin.firestore()
    const collection = db.collection('recruiterIntegrations')

    if (event.httpMethod === 'GET') {
      const snapshot = await collection.where('companyId', '==', companyId).get()
      const records = Object.keys(PROVIDER_CONFIG).map((providerId) => {
        const record =
          snapshot.docs.find((doc: any) => doc.data()?.providerId === providerId)?.data() || {}
        const publicRecord = publicIntegrationRecord(record, providerId)
        return {
          ...publicRecord,
          configured: providerConfigured(providerId),
          requiredScopes: PROVIDER_CONFIG[providerId].scopes || [],
        }
      })
      return json(200, origin, {companyId, integrations: records})
    }

    if (event.httpMethod !== 'POST') return json(405, origin, {error: 'Method Not Allowed'})
    const body = parseJsonBody(event)
    const providerId = cleanText(body.providerId, 80).toLowerCase()
    const action = cleanText(body.action, 30).toLowerCase()
    const config = providerConfig(providerId)
    if (!config) throw new ApplicationError(400, 'Unknown integration provider.')

    const rateLimit = await checkRateLimit({
      admin,
      action: 'recruiter-integration',
      identifier: `uid:${decoded.uid}`,
      limit: 20,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed)
      return json(
        429,
        origin,
        {error: 'Too many integration changes. Please try again later.'},
        {'Retry-After': String(rateLimit.retryAfterSeconds)},
      )

    const ref = collection.doc(`${companyId}_${providerId}`)
    const existing = await ref.get()
    if (action === 'disconnect') {
      await ref.set(
        {
          ...disconnectRecordPatch(companyId, providerId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      )
      await auditIntegration(admin, {
        companyId,
        providerId,
        userId: decoded.uid,
        action: 'disconnect',
        status: 'disconnected',
      })
      return json(200, origin, {providerId, status: 'disconnected'})
    }
    if (action !== 'connect' && action !== 'reconnect')
      throw new ApplicationError(400, 'Unsupported integration action.')
    if (config.capability !== 'oauth') {
      const status =
        config.capability === 'api_access_required'
          ? 'api_access_required'
          : 'configuration_required'
      await ref.set(
        {
          companyId,
          providerId,
          connectionStatus: status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      )
      await auditIntegration(admin, {
        companyId,
        providerId,
        userId: decoded.uid,
        action: 'connection_unavailable',
        status,
      })
      return json(409, origin, {
        providerId,
        status,
        error:
          status === 'api_access_required'
            ? 'Provider API access is required before this integration can be connected.'
            : 'Provider configuration is required before this integration can be connected.',
      })
    }
    if (!providerConfigured(providerId)) {
      await ref.set(
        {
          companyId,
          providerId,
          connectionStatus: 'configuration_required',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      )
      return json(409, origin, {
        providerId,
        status: 'configuration_required',
        error: 'OAuth provider configuration is required before this integration can be connected.',
      })
    }

    const rawState = crypto.randomBytes(32).toString('base64url')
    const stateHash = crypto.createHash('sha256').update(rawState).digest('hex')
    await db
      .collection('recruiterIntegrationOAuthStates')
      .doc(stateHash)
      .set({
        stateHash,
        companyId,
        providerId,
        userId: decoded.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
      })
    await ref.set(
      {
        companyId,
        providerId,
        connectionStatus: 'connecting',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    await auditIntegration(admin, {
      companyId,
      providerId,
      userId: decoded.uid,
      action: action === 'reconnect' ? 'reconnect_start' : 'connect_start',
      status: 'connecting',
    })
    return json(200, origin, {
      providerId,
      status: 'connecting',
      authorizationUrl: oauthUrl(providerId, rawState),
    })
  } catch (error: any) {
    if (error instanceof ApplicationError)
      return json(error.statusCode, origin, {error: error.message})
    console.error(
      'RECRUITER_INTEGRATIONS_ERROR',
      error instanceof Error ? error.name : 'UnknownError',
    )
    return json(500, origin, {error: 'The integration request could not be completed.'})
  }
}
