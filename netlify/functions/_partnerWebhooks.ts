import crypto from 'crypto'
import dns from 'dns/promises'
import https from 'https'
import net from 'net'
import {getAdmin} from './_firebaseAdmin'
import {
  ApiEnvironment,
  ApiError,
  cleanStringArray,
  cleanText,
  createUsageAlert,
  safeUrl,
  timestampToIso,
} from './_apiV1'

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
const PROCESSING_LEASE_MS = 2 * 60 * 1000

function normalizedEnvironment(value: unknown): ApiEnvironment {
  return cleanText(value, 20).toLowerCase() === 'test' ? 'test' : 'live'
}

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

export function isPrivateIp(address: string): boolean {
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
  environment: ApiEnvironment
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
    existing.docs.filter(
      (doc) =>
        doc.data()?.active === true &&
        normalizedEnvironment(doc.data()?.environment) === options.environment,
    ).length >= MAX_ENDPOINTS_PER_ORGANIZATION
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
    environment: options.environment,
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

export async function listWebhookEndpoints(recruiterId: string, environment: ApiEnvironment) {
  const snapshot = await getAdmin()
    .firestore()
    .collection('apiWebhookEndpoints')
    .where('recruiterId', '==', recruiterId)
    .limit(MAX_ENDPOINTS_PER_ORGANIZATION + 10)
    .get()
  return snapshot.docs
    .filter((doc) => normalizedEnvironment(doc.data()?.environment) === environment)
    .map((doc) => {
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

async function ownedWebhookEndpoint(
  recruiterId: string,
  environment: ApiEnvironment,
  endpointId: string,
) {
  const admin = getAdmin()
  const ref = admin.firestore().doc(`apiWebhookEndpoints/${endpointId}`)
  const snapshot = await ref.get()
  if (
    !snapshot.exists ||
    snapshot.data()?.recruiterId !== recruiterId ||
    normalizedEnvironment(snapshot.data()?.environment) !== environment
  ) {
    throw new ApiError(404, 'webhook_not_found', 'The webhook endpoint was not found.')
  }
  return snapshot
}

export async function disableWebhookEndpoint(
  recruiterId: string,
  environment: ApiEnvironment,
  endpointId: string,
) {
  const admin = getAdmin()
  const snapshot = await ownedWebhookEndpoint(recruiterId, environment, endpointId)
  const ref = snapshot.ref
  await ref.set(
    {
      active: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  )
}

export async function rotateWebhookSecret(
  recruiterId: string,
  environment: ApiEnvironment,
  endpointId: string,
) {
  const admin = getAdmin()
  const snapshot = await ownedWebhookEndpoint(recruiterId, environment, endpointId)
  const signingSecret = `whsec_${crypto.randomBytes(32).toString('base64url')}`
  await snapshot.ref.set(
    {
      signingSecret: encryptSecret(signingSecret),
      secretRotatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  )
  return {signingSecret, rotatedAt: new Date().toISOString()}
}

export async function listWebhookDeliveries(
  recruiterId: string,
  environment: ApiEnvironment,
  endpointId: string,
) {
  await ownedWebhookEndpoint(recruiterId, environment, endpointId)
  const snapshot = await getAdmin()
    .firestore()
    .collection('apiWebhookDeliveries')
    .where('endpointId', '==', endpointId)
    .limit(100)
    .get()
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {}
      return {
        id: doc.id,
        eventId: cleanText(data.eventId, 180),
        event: cleanText(data.event, 80),
        ok: data.ok === true,
        responseStatus: Number(data.responseStatus || 0),
        attempt: Number(data.attempt || 0),
        attemptedAt: timestampToIso(data.attemptedAt),
        environment: normalizedEnvironment(data.environment),
      }
    })
    .filter((delivery) => delivery.environment === environment)
    .sort((left, right) =>
      String(right.attemptedAt || '').localeCompare(String(left.attemptedAt || '')),
    )
    .slice(0, 50)
}

function dispatchSignature(eventId: string, environment: ApiEnvironment) {
  return crypto
    .createHmac('sha256', masterKey())
    .update(`${environment}:${eventId}`, 'utf8')
    .digest('hex')
}

async function triggerBackgroundDispatch(eventId: string, environment: ApiEnvironment) {
  const siteUrl = (process.env.URL || process.env.SITE_URL || '').replace(/\/+$/, '')
  if (!siteUrl || /localhost|127\.0\.0\.1/i.test(siteUrl)) return
  try {
    await fetch(`${siteUrl}/.netlify/functions/process-partner-webhooks-background`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Career-Unified-Dispatch': dispatchSignature(eventId, environment),
      },
      body: JSON.stringify({eventId, environment}),
    })
  } catch {
    // The event remains queued and is retried when the next event triggers the worker.
  }
}

export async function enqueuePartnerWebhook(options: {
  recruiterId: string
  environment?: ApiEnvironment
  clientId?: string
  event: string
  data: Record<string, unknown>
}) {
  if (!PARTNER_WEBHOOK_EVENTS.has(options.event) || !options.recruiterId) return null
  const admin = getAdmin()
  const db = admin.firestore()
  const environment = options.environment || 'live'
  const endpoints = await db
    .collection('apiWebhookEndpoints')
    .where('recruiterId', '==', options.recruiterId)
    .limit(MAX_ENDPOINTS_PER_ORGANIZATION + 10)
    .get()
  const hasSubscriber = endpoints.docs.some((doc) => {
    const endpoint = doc.data() || {}
    return (
      endpoint.active === true &&
      normalizedEnvironment(endpoint.environment) === environment &&
      Array.isArray(endpoint.events) &&
      endpoint.events.includes(options.event)
    )
  })
  if (!hasSubscriber) return null

  const ref = db.collection('apiWebhookEvents').doc()
  const now = admin.firestore.Timestamp.now()
  await ref.set({
    recruiterId: options.recruiterId,
    environment,
    clientId: cleanText(options.clientId, 160),
    event: options.event,
    data: options.data,
    status: 'pending',
    attempts: 0,
    deliveredEndpointIds: [],
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: now,
  })
  await triggerBackgroundDispatch(ref.id, environment)
  return ref.id
}

function verifyDispatchRequest(eventId: string, environment: ApiEnvironment, signature: string) {
  const expected = dispatchSignature(eventId, environment)
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

export async function sendWebhookTest(
  recruiterId: string,
  environment: ApiEnvironment,
  endpointId: string,
) {
  const admin = getAdmin()
  const snapshot = await ownedWebhookEndpoint(recruiterId, environment, endpointId)
  if (snapshot.data()?.active !== true) {
    throw new ApiError(409, 'webhook_disabled', 'Enable the webhook endpoint before testing it.')
  }
  const eventId = `test_${crypto.randomUUID()}`
  const result = await deliver(snapshot.data() || {}, eventId, 'test.ping', {
    message: 'Career Unified webhook connection test',
    environment,
  })
  await admin.firestore().collection('apiWebhookDeliveries').add({
    eventId,
    endpointId,
    recruiterId,
    environment,
    event: 'test.ping',
    ok: result.ok,
    responseStatus: result.status,
    attempt: 1,
    attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return {eventId, delivered: result.ok, responseStatus: result.status}
}

export async function replayWebhookEvent(
  recruiterId: string,
  environment: ApiEnvironment,
  eventId: string,
) {
  const admin = getAdmin()
  const ref = admin.firestore().doc(`apiWebhookEvents/${eventId}`)
  const snapshot = await ref.get()
  const data = snapshot.data() || {}
  if (
    !snapshot.exists ||
    data.recruiterId !== recruiterId ||
    normalizedEnvironment(data.environment) !== environment
  ) {
    throw new ApiError(404, 'webhook_event_not_found', 'The webhook event was not found.')
  }
  const now = admin.firestore.Timestamp.now()
  await ref.set(
    {
      status: 'pending',
      attempts: 0,
      deliveredEndpointIds: [],
      nextAttemptAt: now,
      replayedAt: now,
      leaseUntil: null,
      updatedAt: now,
    },
    {merge: true},
  )
  await triggerBackgroundDispatch(eventId, environment)
  return {id: eventId, status: 'pending'}
}

export async function processWebhookQueue(
  eventId: string,
  environment: ApiEnvironment,
  signature: string,
) {
  if (!verifyDispatchRequest(eventId, environment, signature)) {
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
  const [pending, processing] = await Promise.all([
    db.collection('apiWebhookEvents').where('status', '==', 'pending').limit(25).get(),
    db.collection('apiWebhookEvents').where('status', '==', 'processing').limit(25).get(),
  ])
  const queued = [...pending.docs, ...processing.docs]
  const now = Date.now()
  for (const eventDoc of queued) {
    const claimed = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(eventDoc.ref)
      if (!fresh.exists) return null
      const data = fresh.data() || {}
      const nextAttempt = timestampToIso(data.nextAttemptAt)
      const leaseUntil = timestampToIso(data.leaseUntil)
      const pendingAndDue =
        data.status === 'pending' && (!nextAttempt || new Date(nextAttempt).getTime() <= now)
      const abandoned =
        data.status === 'processing' && (!leaseUntil || new Date(leaseUntil).getTime() <= now)
      if (!pendingAndDue && !abandoned) return null
      transaction.set(
        fresh.ref,
        {
          status: 'processing',
          leaseUntil: admin.firestore.Timestamp.fromMillis(now + PROCESSING_LEASE_MS),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      )
      return data
    })
    if (!claimed) continue
    const queuedEvent = claimed
    const environment = normalizedEnvironment(queuedEvent.environment)

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
        normalizedEnvironment(endpoint.environment) === environment &&
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
              consecutiveFailures: 0,
            },
            {merge: true},
          )
        }
        if (!result.ok) {
          await endpointDoc.ref.set(
            {
              consecutiveFailures: admin.firestore.FieldValue.increment(1),
              lastFailureAt: admin.firestore.FieldValue.serverTimestamp(),
              lastFailureStatus: result.status,
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
          environment,
          ok: result.ok,
          responseStatus: result.status,
          attempt: Number(queuedEvent.attempts || 0) + 1,
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
        leaseUntil: null,
        ...(allDelivered ? {deliveredAt: admin.firestore.FieldValue.serverTimestamp()} : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    if (exhausted && !allDelivered) {
      await createUsageAlert({
        admin,
        clientId: cleanText(queuedEvent.clientId, 160) || 'webhook',
        recruiterId: cleanText(queuedEvent.recruiterId, 160),
        organizationId: cleanText(queuedEvent.recruiterId, 160),
        type: 'webhook_delivery_failed',
        severity: 'critical',
        message: `Webhook event ${eventDoc.id} failed after ${attempts} delivery attempts.`,
        dedupeKey: `${eventDoc.id}_webhook_delivery_failed`,
      })
    }
  }
}
