import crypto from 'crypto'
import dns from 'dns/promises'
import https from 'https'
import net from 'net'
import {getAdmin} from './_firebaseAdmin'
import {ApiError, cleanStringArray, cleanText, safeUrl, timestampToIso} from './_apiV1'

export const PARTNER_WEBHOOK_EVENTS = new Set([
  'job.published',
  'job.updated',
  'job.closed',
  'application.received',
  'application.stage_changed',
])

const MAX_ENDPOINTS_PER_ORGANIZATION = 10
const MAX_ATTEMPTS = 6
const DELIVERY_TIMEOUT_MS = 5000

function masterKey() {
  const source = process.env.PARTNER_API_SIGNING_SECRET || ''
  if (source.length < 32) {
    throw new ApiError(
      503,
      'webhooks_not_configured',
      'Partner webhooks are not configured for this environment.',
    )
  }
  return crypto.createHash('sha256').update(source, 'utf8').digest()
}

function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

function decryptSecret(value: Record<string, unknown>) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    masterKey(),
    Buffer.from(cleanText(value.iv, 100), 'base64'),
  )
  decipher.setAuthTag(Buffer.from(cleanText(value.tag, 100), 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(cleanText(value.ciphertext, 500), 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function isPrivateIp(address: string) {
  const normalized = address.toLowerCase().split('%')[0]
  if (!net.isIP(normalized)) return true
  if (net.isIPv4(normalized)) {
    const [a, b, c] = normalized.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    )
  }

  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('::ffff:') ||
    normalized.startsWith('2001:db8:')
  ) {
    return true
  }

  const mappedIpv4 = normalized.match(/^(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1]
  return mappedIpv4 ? isPrivateIp(mappedIpv4) : false
}

async function resolveWebhookTarget(value: unknown) {
  const url = new URL(safeUrl(value, true))
  const hostname = url.hostname.toLowerCase()
  if (
    url.username ||
    url.password ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    net.isIP(hostname)
  ) {
    throw new ApiError(400, 'invalid_webhook_url', 'The webhook URL must use a public HTTPS host.')
  }

  let addresses: Array<{address: string}>
  try {
    addresses = await dns.lookup(hostname, {all: true})
  } catch {
    throw new ApiError(400, 'invalid_webhook_url', 'The webhook host could not be resolved.')
  }
  if (!addresses.length || addresses.some(({address}) => isPrivateIp(address))) {
    throw new ApiError(400, 'invalid_webhook_url', 'The webhook URL must use a public HTTPS host.')
  }
  const address = addresses[0].address
  return {url, address, family: net.isIPv6(address) ? 6 : 4}
}

export async function validateWebhookTarget(value: unknown) {
  const target = await resolveWebhookTarget(value)
  return target.url.toString()
}

export function normalizeWebhookEvents(value: unknown) {
  const events = cleanStringArray(value, 80, PARTNER_WEBHOOK_EVENTS.size)
  const invalid = events.filter((event) => !PARTNER_WEBHOOK_EVENTS.has(event))
  if (!events.length || invalid.length) {
    throw new ApiError(
      400,
      'invalid_webhook_events',
      'Select at least one supported webhook event.',
      {
        supportedEvents: [...PARTNER_WEBHOOK_EVENTS],
      },
    )
  }
  return events
}

export async function createWebhookEndpoint(options: {
  recruiterId: string
  organizationId: string
  clientId: string
  url: unknown
  events: unknown
  description?: unknown
}) {
  const admin = getAdmin()
  const db = admin.firestore()
  const existing = await db
    .collection('apiWebhookEndpoints')
    .where('recruiterId', '==', options.recruiterId)
    .limit(MAX_ENDPOINTS_PER_ORGANIZATION + 1)
    .get()
  if (
    existing.docs.filter((doc) => doc.data()?.active === true).length >=
    MAX_ENDPOINTS_PER_ORGANIZATION
  ) {
    throw new ApiError(
      409,
      'webhook_limit_reached',
      'The organization webhook limit has been reached.',
    )
  }

  const url = await validateWebhookTarget(options.url)
  const events = normalizeWebhookEvents(options.events)
  const signingSecret = `whsec_${crypto.randomBytes(32).toString('base64url')}`
  const ref = db.collection('apiWebhookEndpoints').doc()
  await ref.set({
    recruiterId: options.recruiterId,
    organizationId: options.organizationId,
    createdByClientId: options.clientId,
    url,
    events,
    description: cleanText(options.description, 240),
    active: true,
    signingSecret: encryptSecret(signingSecret),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return {
    endpoint: {id: ref.id, url, events, active: true},
    signingSecret,
  }
}

export async function listWebhookEndpoints(recruiterId: string) {
  const snapshot = await getAdmin()
    .firestore()
    .collection('apiWebhookEndpoints')
    .where('recruiterId', '==', recruiterId)
    .limit(MAX_ENDPOINTS_PER_ORGANIZATION + 10)
    .get()
  return snapshot.docs.map((doc) => {
    const data = doc.data() || {}
    return {
      id: doc.id,
      url: cleanText(data.url, 2000),
      description: cleanText(data.description, 240) || null,
      events: cleanStringArray(data.events, 80, PARTNER_WEBHOOK_EVENTS.size),
      active: data.active === true,
      createdAt: timestampToIso(data.createdAt),
      lastDeliveredAt: timestampToIso(data.lastDeliveredAt),
    }
  })
}

export async function disableWebhookEndpoint(recruiterId: string, endpointId: string) {
  const admin = getAdmin()
  const ref = admin.firestore().doc(`apiWebhookEndpoints/${endpointId}`)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.data()?.recruiterId !== recruiterId) {
    throw new ApiError(404, 'webhook_not_found', 'The webhook endpoint was not found.')
  }
  await ref.set(
    {
      active: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  )
}

function dispatchSignature(eventId: string) {
  return crypto.createHmac('sha256', masterKey()).update(eventId, 'utf8').digest('hex')
}

async function triggerBackgroundDispatch(eventId: string) {
  const siteUrl = (process.env.URL || process.env.SITE_URL || '').replace(/\/+$/, '')
  if (!siteUrl || /localhost|127\.0\.0\.1/i.test(siteUrl)) return
  try {
    await fetch(`${siteUrl}/.netlify/functions/process-partner-webhooks-background`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Career-Unified-Dispatch': dispatchSignature(eventId),
      },
      body: JSON.stringify({eventId}),
    })
  } catch {
    // The event remains queued and is retried when the next event triggers the worker.
  }
}

export async function enqueuePartnerWebhook(options: {
  recruiterId: string
  event: string
  data: Record<string, unknown>
}) {
  if (!PARTNER_WEBHOOK_EVENTS.has(options.event) || !options.recruiterId) return null
  const admin = getAdmin()
  const db = admin.firestore()
  const endpoints = await db
    .collection('apiWebhookEndpoints')
    .where('recruiterId', '==', options.recruiterId)
    .limit(MAX_ENDPOINTS_PER_ORGANIZATION + 10)
    .get()
  const hasSubscriber = endpoints.docs.some((doc) => {
    const endpoint = doc.data() || {}
    return (
      endpoint.active === true &&
      Array.isArray(endpoint.events) &&
      endpoint.events.includes(options.event)
    )
  })
  if (!hasSubscriber) return null

  const ref = db.collection('apiWebhookEvents').doc()
  const now = admin.firestore.Timestamp.now()
  await ref.set({
    recruiterId: options.recruiterId,
    event: options.event,
    data: options.data,
    status: 'pending',
    attempts: 0,
    deliveredEndpointIds: [],
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: now,
  })
  await triggerBackgroundDispatch(ref.id)
  return ref.id
}

function verifyDispatchRequest(eventId: string, signature: string) {
  const expected = dispatchSignature(eventId)
  const left = Buffer.from(signature || '', 'utf8')
  const right = Buffer.from(expected, 'utf8')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

async function deliver(
  endpoint: Record<string, any>,
  eventId: string,
  event: string,
  data: unknown,
) {
  const target = await resolveWebhookTarget(endpoint.url)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const payload = JSON.stringify({
    id: eventId,
    apiVersion: 'v1',
    event,
    createdAt: new Date().toISOString(),
    data,
  })
  const secret = decryptSecret(endpoint.signingSecret || {})
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex')
  return new Promise<{ok: boolean; status: number}>((resolve) => {
    let settled = false
    const finish = (result: {ok: boolean; status: number}) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const request = https.request(
      target.url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString(),
          'User-Agent': 'CareerUnified-Webhooks/1.0',
          'X-Career-Unified-Event': event,
          'X-Career-Unified-Event-Id': eventId,
          'X-Career-Unified-Timestamp': timestamp,
          'X-Career-Unified-Signature': `v1=${signature}`,
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, target.address, target.family as 4 | 6),
      },
      (response) => {
        const status = response.statusCode || 0
        response.resume()
        finish({ok: status >= 200 && status < 300, status})
      },
    )
    request.setTimeout(DELIVERY_TIMEOUT_MS, () => request.destroy(new Error('timeout')))
    request.on('error', () => finish({ok: false, status: 0}))
    request.end(payload)
  })
}

export async function processWebhookQueue(eventId: string, signature: string) {
  if (!verifyDispatchRequest(eventId, signature)) {
    throw new ApiError(
      401,
      'invalid_dispatch_signature',
      'The webhook dispatch request is invalid.',
    )
  }

  await processPendingWebhooks()
}

export async function processPendingWebhooks() {
  const admin = getAdmin()
  const db = admin.firestore()
  const queued = await db
    .collection('apiWebhookEvents')
    .where('status', '==', 'pending')
    .limit(25)
    .get()
  const now = Date.now()
  for (const eventDoc of queued.docs) {
    const queuedEvent = eventDoc.data() || {}
    const nextAttempt = timestampToIso(queuedEvent.nextAttemptAt)
    if (nextAttempt && new Date(nextAttempt).getTime() > now) continue

    const endpoints = await db
      .collection('apiWebhookEndpoints')
      .where('recruiterId', '==', cleanText(queuedEvent.recruiterId, 160))
      .limit(MAX_ENDPOINTS_PER_ORGANIZATION + 10)
      .get()
    const deliveredIds = new Set(cleanStringArray(queuedEvent.deliveredEndpointIds, 180, 50))
    const targets = endpoints.docs.filter((doc) => {
      const endpoint = doc.data() || {}
      return (
        endpoint.active === true &&
        Array.isArray(endpoint.events) &&
        endpoint.events.includes(queuedEvent.event) &&
        !deliveredIds.has(doc.id)
      )
    })

    const results = await Promise.all(
      targets.map(async (endpointDoc) => {
        const result = await deliver(
          endpointDoc.data() || {},
          eventDoc.id,
          cleanText(queuedEvent.event, 80),
          queuedEvent.data || {},
        )
        if (result.ok) {
          deliveredIds.add(endpointDoc.id)
          await endpointDoc.ref.set(
            {
              lastDeliveredAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {merge: true},
          )
        }
        await db.collection('apiWebhookDeliveries').add({
          eventId: eventDoc.id,
          endpointId: endpointDoc.id,
          recruiterId: queuedEvent.recruiterId,
          event: queuedEvent.event,
          ok: result.ok,
          responseStatus: result.status,
          attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        return result
      }),
    )

    const attempts = Number(queuedEvent.attempts || 0) + 1
    const allDelivered = targets.length === 0 || results.every((result) => result.ok)
    const exhausted = attempts >= MAX_ATTEMPTS
    const nextAttemptAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + Math.min(60, 2 ** attempts) * 60 * 1000,
    )
    await eventDoc.ref.set(
      {
        status: allDelivered ? 'delivered' : exhausted ? 'failed' : 'pending',
        attempts,
        deliveredEndpointIds: [...deliveredIds],
        nextAttemptAt,
        ...(allDelivered ? {deliveredAt: admin.firestore.FieldValue.serverTimestamp()} : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
  }
}
