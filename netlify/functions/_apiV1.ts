import crypto from 'crypto'
import type {HandlerEvent} from '@netlify/functions'
import {getAdmin} from './_firebaseAdmin'
import {sendTransactionalEmail} from './_notify'
import {checkRateLimit, clientIpFromHeaders} from './_rateLimit'

export const API_VERSION = 'v1'
export const API_KEY_PREFIX = 'cu_live_'
export const API_TEST_KEY_PREFIX = 'cu_test_'
export const PUBLIC_RATE_LIMIT = 300
export const PUBLIC_RATE_WINDOW_SECONDS = 10 * 60
export const API_PLAN_MONTHLY_QUOTAS: Record<string, number> = {
  pilot: 10_000,
  starter: 25_000,
  growth: 75_000,
  enterprise: 250_000,
}

export const ALLOWED_API_SCOPES = new Set([
  'jobs:read',
  'jobs:write',
  'applications:read',
  'applications:write',
  'webhooks:manage',
])

export type ApiClient = {
  id: string
  name: string
  recruiterId: string
  organizationId: string
  scopes: string[]
  rateLimitPerMinute: number
  allowedOrigins: string[]
  environment: 'live' | 'test'
  monthlyQuota: number
  billingMode: string
  apiPlan: string
  overageRateCents: number
}

export type ApiEnvironment = 'live' | 'test'

export function apiDataCollections(environment: ApiEnvironment) {
  const sandbox = environment === 'test'
  return {
    jobs: sandbox ? 'apiSandboxJobs' : 'jobs',
    applications: sandbox ? 'apiSandboxApplications' : 'applications',
    idempotency: sandbox ? 'apiSandboxIdempotency' : 'apiIdempotency',
  }
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export function requestId(event: HandlerEvent) {
  const supplied = cleanText(event.headers['x-request-id'] || event.headers['X-Request-Id'], 100)
  return supplied && /^[A-Za-z0-9._:-]+$/.test(supplied) ? supplied : crypto.randomUUID()
}

function allowedPublicOrigin(origin?: string) {
  return origin ? origin : '*'
}

export function apiHeaders(options: {
  origin?: string
  publicRoute?: boolean
  requestId: string
  cacheControl?: string
  extra?: Record<string, string>
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-API-Version': API_VERSION,
    'X-Request-Id': options.requestId,
    'Cache-Control': options.cacheControl || 'private, no-store',
    Vary: 'Origin, Authorization, X-API-Key',
    ...(options.extra || {}),
  }

  if (options.publicRoute) {
    headers['Access-Control-Allow-Origin'] = allowedPublicOrigin(options.origin)
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Request-Id'
  }

  return headers
}

export function success(
  statusCode: number,
  id: string,
  data: unknown,
  options: {
    origin?: string
    publicRoute?: boolean
    meta?: Record<string, unknown>
    cacheControl?: string
    extraHeaders?: Record<string, string>
  } = {},
) {
  return {
    statusCode,
    headers: apiHeaders({
      origin: options.origin,
      publicRoute: options.publicRoute,
      requestId: id,
      cacheControl: options.cacheControl,
      extra: options.extraHeaders,
    }),
    body: JSON.stringify({data, ...(options.meta ? {meta: options.meta} : {})}),
  }
}

export function failure(
  error: ApiError,
  id: string,
  options: {origin?: string; publicRoute?: boolean; extraHeaders?: Record<string, string>} = {},
) {
  return {
    statusCode: error.statusCode,
    headers: apiHeaders({
      origin: options.origin,
      publicRoute: options.publicRoute,
      requestId: id,
      extra: options.extraHeaders,
    }),
    body: JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        requestId: id,
        ...(error.details ? {details: error.details} : {}),
      },
    }),
  }
}

export function parseJsonBody(event: HandlerEvent, maxBytes = 250_000) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || ''
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw new ApiError(413, 'payload_too_large', 'The request body is too large.')
  }
  try {
    return JSON.parse(raw || '{}')
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body must contain valid JSON.')
  }
}

export function cleanText(value: unknown, maxLength = 240) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function cleanMultiline(value: unknown, maxLength = 30_000) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength)
}

export function cleanStringArray(value: unknown, itemLength = 120, maxItems = 20) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => cleanText(item, itemLength)).filter(Boolean))].slice(
    0,
    maxItems,
  )
}

export function safeUrl(value: unknown, required = false) {
  const raw = cleanText(value, 2000)
  if (!raw) {
    if (required) throw new ApiError(400, 'invalid_url', 'A valid HTTPS URL is required.')
    return ''
  }
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') throw new Error('HTTPS required')
    return url.toString()
  } catch {
    throw new ApiError(400, 'invalid_url', 'A valid HTTPS URL is required.')
  }
}

export function slugify(value: unknown) {
  return cleanText(value, 220)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 170)
    .replace(/-+$/g, '')
}

export function timestampToIso(value: any) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function dateOnly(value: unknown) {
  const raw = cleanText(value, 40)
  if (!raw) return ''
  const parsed = new Date(`${raw}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw
  ) {
    throw new ApiError(400, 'invalid_date', 'Dates must use the YYYY-MM-DD format.')
  }
  return raw
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function parseLimit(value: unknown, defaultValue = 25, maximum = 100) {
  const parsed = Number(value ?? defaultValue)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ApiError(400, 'invalid_limit', `Limit must be between 1 and ${maximum}.`)
  }
  return parsed
}

export function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({v: 1, offset}), 'utf8').toString('base64url')
}

export function decodeCursor(value: unknown) {
  const raw = cleanText(value, 300)
  if (!raw) return 0
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (decoded.v !== 1 || !Number.isInteger(decoded.offset) || decoded.offset < 0)
      throw new Error()
    return decoded.offset
  } catch {
    throw new ApiError(400, 'invalid_cursor', 'The pagination cursor is invalid.')
  }
}

export function paginate<T>(items: T[], limit: number, offset: number) {
  const data = items.slice(offset, offset + limit)
  const nextOffset = offset + data.length
  return {
    data,
    nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
    hasMore: nextOffset < items.length,
  }
}

export function apiKeyHash(clientId: string, secret: string) {
  return crypto.createHash('sha256').update(`${clientId}.${secret}`, 'utf8').digest('hex')
}

export function apiCredentialMatches(
  data: Record<string, any>,
  clientId: string,
  secret: string,
  now = new Date(),
) {
  const suppliedHash = apiKeyHash(clientId, secret)
  const currentHash = cleanText(data.keyHash, 128)
  if (currentHash && secureEqual(suppliedHash, currentHash)) return 'current'

  const previousHash = cleanText(data.previousKeyHash, 128)
  const previousExpiry = timestampToIso(data.previousKeyExpiresAt)
  if (
    previousHash &&
    previousExpiry &&
    new Date(previousExpiry).getTime() > now.getTime() &&
    secureEqual(suppliedHash, previousHash)
  ) {
    return 'previous'
  }
  return null
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function apiKeyPrefixFor(environment: unknown) {
  return cleanText(environment, 20).toLowerCase() === 'test' ? API_TEST_KEY_PREFIX : API_KEY_PREFIX
}

export function createApiCredential(clientId: string, environment: 'live' | 'test' = 'live') {
  const secret = crypto.randomBytes(32).toString('base64url')
  const prefix = apiKeyPrefixFor(environment)
  return {
    apiKey: `${prefix}${clientId}.${secret}`,
    keyHash: apiKeyHash(clientId, secret),
    keyPrefix: `${prefix}${clientId.slice(0, 8)}`,
  }
}

function readApiKey(event: HandlerEvent) {
  const direct = event.headers['x-api-key'] || event.headers['X-Api-Key']
  if (direct) return direct.trim()
  const authorization = event.headers.authorization || event.headers.Authorization || ''
  return authorization.startsWith('Bearer cu_live_') || authorization.startsWith('Bearer cu_test_')
    ? authorization.slice(7).trim()
    : ''
}

function parseApiKey(value: string) {
  const prefix = value.startsWith(API_TEST_KEY_PREFIX)
    ? API_TEST_KEY_PREFIX
    : value.startsWith(API_KEY_PREFIX)
      ? API_KEY_PREFIX
      : ''
  if (!prefix) return null
  const separator = value.indexOf('.')
  if (separator < prefix.length + 1) return null
  const clientId = value.slice(prefix.length, separator)
  const secret = value.slice(separator + 1)
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(clientId) || !/^[A-Za-z0-9_-]{32,160}$/.test(secret)) {
    return null
  }
  return {clientId, secret, environment: prefix === API_TEST_KEY_PREFIX ? 'test' : 'live'}
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function nextMonthRetrySeconds(date = new Date()) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0))
  return Math.max(60, Math.ceil((next.getTime() - date.getTime()) / 1000))
}

function normalizedApiPlan(value: unknown) {
  const plan = cleanText(value, 40).toLowerCase()
  return API_PLAN_MONTHLY_QUOTAS[plan] ? plan : 'pilot'
}

export function monthlyQuotaForClient(data: Record<string, any>) {
  const configured = Number(data.monthlyQuota)
  if (Number.isFinite(configured) && Number.isInteger(configured) && configured >= 0) {
    return Math.min(5_000_000, configured)
  }
  return API_PLAN_MONTHLY_QUOTAS[normalizedApiPlan(data.apiPlan)]
}

async function deliverApiAlertEmail(
  ref: any,
  options: {
    clientId: string
    recruiterId: string
    type: string
    severity: 'info' | 'warning' | 'critical'
    message: string
  },
) {
  const apiKey = cleanText(process.env.RESEND_API_KEY, 500)
  const recipients = new Set<string>()
  const addRecipient = (value: unknown) => {
    const email = cleanText(value, 254).toLowerCase()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) recipients.add(email)
  }
  addRecipient(process.env.API_ALERT_EMAIL)

  if (options.clientId !== 'platform') {
    const admin = getAdmin()
    const [client, recruiter] = await Promise.all([
      admin.firestore().doc(`apiClients/${options.clientId}`).get(),
      admin.firestore().doc(`recruiters/${options.recruiterId}`).get(),
    ])
    cleanStringArray(client.data()?.alertEmails, 254, 10).forEach(addRecipient)
    const recruiterData = recruiter.data() || {}
    addRecipient(recruiterData.email)
    addRecipient(recruiterData.contactEmail)
    addRecipient(recruiterData.companyEmail)
  }

  if (!apiKey || !recipients.size) {
    await ref.set({emailStatus: 'not_configured'}, {merge: true})
    return
  }
  try {
    await sendTransactionalEmail({
      from: cleanText(process.env.API_ALERT_FROM_EMAIL, 254) || undefined,
      to: [...recipients],
      subject: `[${options.severity.toUpperCase()}] Career Unified API: ${options.type}`,
      text: `${options.message}\n\nAPI client: ${options.clientId}\nReview: ${process.env.SITE_URL || process.env.URL || 'https://careerunified.com'}/api/admin.html`,
      tag: 'api-alert',
    })
    await ref.set(
      {
        emailStatus: 'sent',
        emailAttemptedAt: new Date().toISOString(),
        emailRecipientCount: recipients.size,
      },
      {merge: true},
    )
  } catch {
    await ref.set(
      {emailStatus: 'failed', emailAttemptedAt: new Date().toISOString()},
      {merge: true},
    )
  }
}

export async function createUsageAlert(options: {
  admin: any
  clientId: string
  recruiterId: string
  organizationId: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  dedupeKey: string
}) {
  const ref = options.admin.firestore().collection('apiAlerts').doc(options.dedupeKey)
  const snapshot = await ref.get()
  if (snapshot.exists) return
  await ref.set({
    clientId: options.clientId,
    recruiterId: options.recruiterId,
    organizationId: options.organizationId,
    type: options.type,
    severity: options.severity,
    message: options.message,
    acknowledged: false,
    createdAt: options.admin.firestore.FieldValue.serverTimestamp(),
  })
  await deliverApiAlertEmail(ref, options)
}

async function recordKnownClientAuthenticationFailure(
  admin: any,
  clientId: string,
  data: Record<string, any>,
) {
  const day = dayKey()
  const ref = admin.firestore().doc(`apiSecurityDaily/${clientId}_${day}`)
  let nextCount = 0
  await admin.firestore().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref)
    nextCount = Number(snapshot.data()?.failedAuthenticationCount || 0) + 1
    transaction.set(
      ref,
      {
        clientId,
        day,
        failedAuthenticationCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
  })
  if (nextCount === 5 || nextCount === 20 || nextCount === 100) {
    await createUsageAlert({
      admin,
      clientId,
      recruiterId: cleanText(data.recruiterId, 160),
      organizationId: cleanText(data.organizationId, 160) || cleanText(data.recruiterId, 160),
      type: 'authentication_failures',
      severity: nextCount >= 20 ? 'critical' : 'warning',
      message: `This API client recorded ${nextCount} failed authentication attempts today.`,
      dedupeKey: `${clientId}_${day}_authentication_failures_${nextCount}`,
    })
  }
}

async function recordApiUsage(options: {
  admin: any
  clientId: string
  recruiterId: string
  organizationId: string
  requestId: string
  method: string
  route: string
  environment: 'live' | 'test'
  monthlyQuota: number
}) {
  const now = new Date()
  const day = dayKey(now)
  const month = monthKey(now)
  const db = options.admin.firestore()
  const monthRef = db.doc(`apiUsageMonthly/${options.clientId}_${month}`)
  const dayRef = db.doc(`apiUsageDaily/${options.clientId}_${day}`)
  let nextCount = 0

  await db.runTransaction(async (transaction: any) => {
    const monthSnap = await transaction.get(monthRef)
    const current = Number(monthSnap.data()?.requestCount || 0)
    if (options.monthlyQuota > 0 && current >= options.monthlyQuota) {
      throw new ApiError(429, 'monthly_quota_exceeded', 'The monthly API quota has been reached.', {
        retryAfterSeconds: nextMonthRetrySeconds(now),
      })
    }
    nextCount = current + 1
    const usagePayload = {
      clientId: options.clientId,
      recruiterId: options.recruiterId,
      organizationId: options.organizationId,
      environment: options.environment,
      lastRequestId: options.requestId,
      lastMethod: options.method,
      lastRoute: options.route,
      updatedAt: options.admin.firestore.FieldValue.serverTimestamp(),
    }
    transaction.set(
      monthRef,
      {
        ...usagePayload,
        month,
        monthlyQuota: options.monthlyQuota,
        requestCount: options.admin.firestore.FieldValue.increment(1),
        createdAt: monthSnap.exists
          ? monthSnap.data()?.createdAt || options.admin.firestore.FieldValue.serverTimestamp()
          : options.admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    transaction.set(
      dayRef,
      {
        ...usagePayload,
        day,
        month,
        requestCount: options.admin.firestore.FieldValue.increment(1),
        createdAt: options.admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
  })

  if (options.monthlyQuota > 0) {
    const percentUsed = nextCount / options.monthlyQuota
    if (percentUsed >= 1) {
      await createUsageAlert({
        ...options,
        type: 'quota_exhausted',
        severity: 'critical',
        message: 'This API client has exhausted its monthly quota.',
        dedupeKey: `${options.clientId}_${month}_quota_exhausted`,
      })
    } else if (percentUsed >= 0.8) {
      await createUsageAlert({
        ...options,
        type: 'quota_warning',
        severity: 'warning',
        message: 'This API client has used more than 80% of its monthly quota.',
        dedupeKey: `${options.clientId}_${month}_quota_warning`,
      })
    }
  }
}

export async function authenticateApiClient(event: HandlerEvent, id: string): Promise<ApiClient> {
  const parsed = parseApiKey(readApiKey(event))
  if (!parsed) throw new ApiError(401, 'invalid_api_key', 'A valid partner API key is required.')

  const admin = getAdmin()
  const clientRef = admin.firestore().doc(`apiClients/${parsed.clientId}`)
  const clientSnap = await clientRef.get()
  if (!clientSnap.exists)
    throw new ApiError(401, 'invalid_api_key', 'A valid partner API key is required.')

  const data = clientSnap.data() || {}
  const environment = cleanText(data.environment, 20).toLowerCase() === 'test' ? 'test' : 'live'
  if (parsed.environment !== environment) {
    throw new ApiError(401, 'invalid_api_key', 'A valid partner API key is required.')
  }
  const matchedCredential = apiCredentialMatches(data, parsed.clientId, parsed.secret)
  if (data.active !== true || !matchedCredential) {
    if (data.active === true) {
      await recordKnownClientAuthenticationFailure(admin, parsed.clientId, data)
    }
    throw new ApiError(401, 'invalid_api_key', 'A valid partner API key is required.')
  }

  const origin = cleanText(event.headers.origin || event.headers.Origin, 500)
  const allowedOrigins = cleanStringArray(data.allowedOrigins, 500, 20)
  if (origin && !allowedOrigins.includes(origin)) {
    throw new ApiError(
      403,
      'browser_origin_not_allowed',
      'This API key is not permitted for requests from this browser origin.',
    )
  }

  const recruiterId = cleanText(data.recruiterId, 160)
  if (!recruiterId)
    throw new ApiError(403, 'client_not_configured', 'This API client is not configured.')
  const scopes = cleanStringArray(data.scopes, 80, ALLOWED_API_SCOPES.size).filter((scope) =>
    ALLOWED_API_SCOPES.has(scope),
  )
  const configuredRateLimit = Number(data.rateLimitPerMinute || 600)
  const rateLimitPerMinute = Number.isFinite(configuredRateLimit)
    ? Math.min(5000, Math.max(30, Math.trunc(configuredRateLimit)))
    : 600
  const monthlyQuota = monthlyQuotaForClient(data)

  const rate = await checkRateLimit({
    admin,
    action: 'partner-api',
    identifier: parsed.clientId,
    limit: rateLimitPerMinute,
    windowSeconds: 60,
  })
  if (!rate.allowed) {
    await createUsageAlert({
      admin,
      clientId: parsed.clientId,
      recruiterId,
      organizationId: cleanText(data.organizationId, 160) || recruiterId,
      type: 'rate_limit_exceeded',
      severity: 'warning',
      message: 'This API client hit its per-minute rate limit.',
      dedupeKey: `${parsed.clientId}_${dayKey()}_rate_limit_exceeded`,
    })
    throw new ApiError(429, 'rate_limit_exceeded', 'The API rate limit has been exceeded.', {
      retryAfterSeconds: rate.retryAfterSeconds,
    })
  }

  await recordApiUsage({
    admin,
    clientId: parsed.clientId,
    recruiterId,
    organizationId: cleanText(data.organizationId, 160) || recruiterId,
    requestId: id,
    method: event.httpMethod,
    route: routeParts(event).join('/'),
    environment,
    monthlyQuota,
  })

  await clientRef.set(
    {
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastRequestId: id,
      ...(matchedCredential === 'previous'
        ? {previousKeyLastUsedAt: admin.firestore.FieldValue.serverTimestamp()}
        : {}),
    },
    {merge: true},
  )

  return {
    id: parsed.clientId,
    name: cleanText(data.name, 160),
    recruiterId,
    organizationId: cleanText(data.organizationId, 160) || recruiterId,
    scopes,
    rateLimitPerMinute,
    allowedOrigins,
    environment,
    monthlyQuota,
    billingMode: cleanText(data.billingMode, 40) || 'included',
    apiPlan: cleanText(data.apiPlan, 40) || 'pilot',
    overageRateCents: Math.max(0, Number(data.overageRateCents || 0)),
  }
}

export function requireScope(client: ApiClient, scope: string) {
  if (!client.scopes.includes(scope)) {
    throw new ApiError(403, 'insufficient_scope', `The ${scope} scope is required.`)
  }
}

export async function authenticateAdmin(event: HandlerEvent) {
  const authorization = event.headers.authorization || event.headers.Authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token || token.startsWith(API_KEY_PREFIX) || token.startsWith(API_TEST_KEY_PREFIX)) {
    throw new ApiError(
      401,
      'admin_authentication_required',
      'Administrator authentication is required.',
    )
  }
  try {
    const decoded: any = await getAdmin().auth().verifyIdToken(token)
    if (decoded.admin !== true) {
      throw new ApiError(403, 'admin_access_required', 'Administrator access is required.')
    }
    return decoded
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(
      401,
      'invalid_admin_session',
      'The administrator session is invalid or expired.',
    )
  }
}

export async function authenticateApiPartner(event: HandlerEvent) {
  const authorization = event.headers.authorization || event.headers.Authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token || token.startsWith(API_KEY_PREFIX) || token.startsWith(API_TEST_KEY_PREFIX)) {
    throw new ApiError(
      401,
      'partner_authentication_required',
      'Recruiter authentication is required.',
    )
  }
  try {
    const decoded: any = await getAdmin().auth().verifyIdToken(token)
    if (decoded.admin === true) return decoded
    if (decoded.recruiter !== true) {
      throw new ApiError(403, 'partner_access_required', 'Approved recruiter access is required.')
    }
    const recruiter = await getAdmin().firestore().doc(`recruiters/${decoded.uid}`).get()
    if (!recruiter.exists || recruiter.data()?.apiSelfServiceEnabled !== true) {
      throw new ApiError(
        403,
        'partner_access_required',
        'API self-service is not enabled for this organisation.',
      )
    }
    return decoded
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(
      401,
      'invalid_partner_session',
      'The recruiter session is invalid or expired.',
    )
  }
}

export async function recordApiHealth(options: {
  requestId: string
  method: string
  route: string
  statusCode: number
  durationMs: number
}) {
  try {
    const admin = getAdmin()
    const day = dayKey()
    const ref = admin.firestore().doc(`apiHealthDaily/${day}`)
    const isError = options.statusCode >= 500
    await ref.set(
      {
        day,
        totalRequests: admin.firestore.FieldValue.increment(1),
        totalLatencyMs: admin.firestore.FieldValue.increment(
          Math.max(0, Math.round(options.durationMs)),
        ),
        serverErrors: admin.firestore.FieldValue.increment(isError ? 1 : 0),
        clientErrors: admin.firestore.FieldValue.increment(
          options.statusCode >= 400 && options.statusCode < 500 ? 1 : 0,
        ),
        lastStatusCode: options.statusCode,
        lastRequestId: options.requestId,
        lastMethod: cleanText(options.method, 20),
        lastRoute: cleanText(options.route, 300),
        ...(isError ? {lastServerErrorAt: admin.firestore.FieldValue.serverTimestamp()} : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
  } catch {
    // Monitoring must never interrupt an API response.
  }
}

export async function applyPublicRateLimit(event: HandlerEvent) {
  const admin = getAdmin()
  const identifier = clientIpFromHeaders(event.headers as Record<string, string | undefined>)
  const result = await checkRateLimit({
    admin,
    action: 'public-api',
    identifier,
    limit: PUBLIC_RATE_LIMIT,
    windowSeconds: PUBLIC_RATE_WINDOW_SECONDS,
  })
  if (!result.allowed) {
    throw new ApiError(429, 'rate_limit_exceeded', 'The public API rate limit has been exceeded.', {
      retryAfterSeconds: result.retryAfterSeconds,
    })
  }
  return result
}

export function normalizeScopes(value: unknown) {
  const scopes = cleanStringArray(value, 80, ALLOWED_API_SCOPES.size)
  const invalid = scopes.filter((scope) => !ALLOWED_API_SCOPES.has(scope))
  if (invalid.length) {
    throw new ApiError(400, 'invalid_scope', 'One or more requested API scopes are invalid.', {
      invalidScopes: invalid,
    })
  }
  return scopes
}

export function validResourceId(value: unknown, label = 'resource') {
  const id = cleanText(value, 180)
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new ApiError(400, 'invalid_resource_id', `The ${label} identifier is invalid.`)
  }
  return id
}

export function routeParts(event: HandlerEvent) {
  const routed = cleanText(event.queryStringParameters?.route, 1000)
  const raw = routed || event.path.replace(/^.*\/api-v1\/?/, '')
  return raw
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        throw new ApiError(400, 'invalid_route', 'The API route is invalid.')
      }
    })
    .map((part) => cleanText(part, 220))
    .filter(Boolean)
}

export function canonicalJobFromSanity(job: Record<string, any>, siteUrl: string) {
  const slug = slugify(job.slug || job.title || job._id)
  const deadline = cleanText(job.deadline, 40) || null
  return {
    id: cleanText(job._id, 180),
    source: 'career_unified_editorial',
    slug,
    title: cleanText(job.title, 220),
    description: cleanMultiline(job.description, 30_000) || null,
    category: cleanText(job.category, 120) || null,
    employmentType: cleanText(job.jobType, 120) || null,
    location: {display: cleanText(job.location, 240) || 'South Africa'},
    salary: cleanText(job.salary, 160) || null,
    organization: {
      id: null,
      name: cleanText(job.companyName, 180) || 'Confidential',
      logoUrl: cleanText(job.companyLogo, 2000) || null,
    },
    dates: {
      posted: cleanText(job.posted, 40) || null,
      closing: deadline,
      closingText: cleanText(job.deadlineText, 120) || (deadline ? null : 'Unspecified'),
      updatedAt: timestampToIso(job._updatedAt),
    },
    application: {
      method: 'external',
      url: cleanText(job.applyLink, 2000) || null,
    },
    links: {
      self: `${siteUrl}/api/v1/jobs/${encodeURIComponent(slug)}`,
      web: `${siteUrl}/jobs/${encodeURIComponent(slug)}`,
    },
  }
}

export function canonicalJobFromFirestore(id: string, job: Record<string, any>, siteUrl: string) {
  const title = cleanText(job.title || job.jobTitle, 220)
  const slug = cleanText(job.slug, 220) || `${slugify(title)}--${id.slice(0, 6)}`
  const method = ['direct', 'external', 'email'].includes(cleanText(job.applicationMethod, 20))
    ? cleanText(job.applicationMethod, 20)
    : 'external'
  const location =
    cleanText(job.location, 240) ||
    [job.city, job.country]
      .map((part) => cleanText(part, 120))
      .filter(Boolean)
      .join(', ')
  const description = [job.overview, job.description, job.responsibilities, job.requirements]
    .map((part) => cleanMultiline(part, 30_000))
    .filter(Boolean)
    .join('\n\n')
  return {
    id,
    source: 'career_unified_recruiter',
    slug,
    title,
    description: description || null,
    category: cleanText(job.category, 120) || null,
    employmentType: cleanText(job.type || job.jobType, 120) || null,
    workPreference: cleanText(job.workPreference, 80) || null,
    experienceLevel: cleanText(job.experience, 120) || null,
    location: {
      display: location || 'South Africa',
      city: cleanText(job.city, 120) || null,
      country: cleanText(job.country, 120) || null,
    },
    salary: cleanText(job.salary, 160) || null,
    organization: {
      id: cleanText(job.recruiterId, 160) || null,
      name: cleanText(job.company, 180) || 'Confidential',
      logoUrl: cleanText(job.logo, 2000) || null,
      website: cleanText(job.website, 2000) || null,
      socialLinks:
        job.companySocialLinks && typeof job.companySocialLinks === 'object'
          ? Object.fromEntries(
              Object.entries(job.companySocialLinks)
                .map(([key, value]) => [key, cleanText(value, 2000)])
                .filter(([, value]) => Boolean(value)),
            )
          : {},
    },
    dates: {
      posted: timestampToIso(job.createdAt),
      closing: cleanText(job.deadline, 40) || null,
      closingText: cleanText(job.deadlineText, 120) || (job.deadline ? null : 'Unspecified'),
      updatedAt: timestampToIso(job.updatedAt),
    },
    application: {
      method,
      url:
        method === 'direct'
          ? `${siteUrl}/apply.html?job=${encodeURIComponent(id)}`
          : method === 'external'
            ? cleanText(job.applyLink, 2000) || null
            : null,
      screeningQuestionCount: Array.isArray(job.screeningQuestions)
        ? job.screeningQuestions.length
        : 0,
    },
    links: {
      self: `${siteUrl}/api/v1/jobs/${encodeURIComponent(slug)}`,
      web: `${siteUrl}/jobs/${encodeURIComponent(slug)}`,
    },
  }
}

export function canonicalBursary(bursary: Record<string, any>, siteUrl: string) {
  const slug = slugify(bursary.slug || bursary.name || bursary._id)
  const faculties = cleanStringArray(
    Array.isArray(bursary.faculties) && bursary.faculties.length
      ? bursary.faculties
      : bursary.faculty
        ? [bursary.faculty]
        : [],
    120,
    30,
  )
  return {
    id: cleanText(bursary._id, 180),
    source: 'career_unified_editorial',
    slug,
    name: cleanText(bursary.name, 220),
    provider: cleanText(bursary.provider, 180),
    description: cleanMultiline(bursary.description, 30_000) || null,
    faculties,
    closingDate: cleanText(bursary.deadline, 40) || null,
    providerLogoUrl: cleanText(bursary.providerLogoUrl, 2000) || null,
    applicationUrl: cleanText(bursary.applicationLink, 2000) || null,
    updatedAt: timestampToIso(bursary._updatedAt),
    links: {
      self: `${siteUrl}/api/v1/bursaries/${encodeURIComponent(slug)}`,
      web: `${siteUrl}/bursary/${encodeURIComponent(slug)}`,
    },
  }
}

function questionList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 8)
    .map((question: any, index) => {
      const type = ['yes_no', 'number', 'single_select', 'multi_select', 'short_text'].includes(
        question?.type,
      )
        ? question.type
        : 'short_text'
      const label = cleanText(question?.label, 240)
      return {
        id: cleanText(question?.id, 80) || `question_${index + 1}`,
        label,
        templateKey: cleanText(question?.templateKey, 80),
        type,
        required: question?.required !== false,
        options: ['single_select', 'multi_select'].includes(type)
          ? cleanStringArray(question?.options, 120, 20)
          : [],
        criteria: null,
      }
    })
    .filter((question) => question.label)
}

export function validatePartnerJob(
  input: Record<string, any>,
  companyProfile: Record<string, any>,
) {
  const title = cleanText(input.title, 180)
  const category = cleanText(input.category, 120)
  const type = cleanText(input.employmentType || input.type, 120)
  const description = cleanMultiline(input.description, 30_000)
  const locationValue = input.location && typeof input.location === 'object' ? input.location : {}
  const city = cleanText(input.city || locationValue.city, 120)
  const country = cleanText(input.country || locationValue.country, 120) || 'South Africa'
  const company = cleanText(companyProfile.name, 180)
  const email = cleanText(companyProfile.email, 254).toLowerCase()

  const missing = [
    ['title', title],
    ['category', category],
    ['employmentType', type],
    ['description', description],
    ['city', city],
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field)
  if (missing.length) {
    throw new ApiError(400, 'validation_failed', 'Required job fields are missing.', {
      fields: missing,
    })
  }
  if (!company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(
      409,
      'company_profile_incomplete',
      'Complete the recruiter company profile before publishing through the API.',
    )
  }

  const applicationMethod = ['direct', 'external', 'email'].includes(
    cleanText(input.applicationMethod, 20),
  )
    ? cleanText(input.applicationMethod, 20)
    : 'direct'
  const applyLink = applicationMethod === 'external' ? safeUrl(input.applyLink, true) : ''
  const deadline = dateOnly(input.closingDate || input.deadline)
  const salary = cleanText(input.salary, 160) || 'Negotiable'

  const socialLinks =
    companyProfile.socialLinks && typeof companyProfile.socialLinks === 'object'
      ? Object.fromEntries(
          Object.entries(companyProfile.socialLinks)
            .map(([key, value]) => [cleanText(key, 30), safeUrl(value)])
            .filter(([key, value]) => Boolean(key && value)),
        )
      : {}

  return {
    title,
    category,
    type,
    experience: cleanText(input.experienceLevel || input.experience, 120) || 'Not specified',
    minimumQualification: cleanText(input.minimumQualification, 250),
    description,
    overview: cleanMultiline(input.overview, 20_000),
    responsibilities: cleanMultiline(input.responsibilities, 20_000),
    requirements: cleanMultiline(input.requirements, 20_000),
    facilities: cleanStringArray(input.facilities, 120, 30),
    city,
    country,
    location: [city, country].filter(Boolean).join(', '),
    workPreference: cleanText(input.workPreference, 80) || 'On Site',
    remote: input.remote === true,
    salary,
    deadline,
    deadlineText:
      cleanText(input.closingText || input.deadlineText, 120) || (deadline ? '' : 'Unspecified'),
    applicationMethod,
    applyLink,
    screeningQuestions:
      applicationMethod === 'direct' ? questionList(input.screeningQuestions) : [],
    hiringProcess: cleanStringArray(input.hiringProcess, 80, 10),
    status: 'active',
    company,
    email,
    website: safeUrl(companyProfile.website),
    logo: safeUrl(companyProfile.logo),
    companySocialLinks: socialLinks,
    companyProfileVersion: cleanText(input.companyProfileVersion, 120),
    companyIndustry: cleanText(companyProfile.industry, 160),
    companySize: cleanText(companyProfile.size, 80),
    companyAbout: cleanMultiline(companyProfile.about, 3000),
    companyHQCity: cleanText(companyProfile.city, 120),
    companyHQCountry: cleanText(companyProfile.country, 120),
    companyContactName: cleanText(companyProfile.contactName, 180),
  }
}

export function hasActiveRecruiterAccess(recruiter: Record<string, any>, now = new Date()) {
  const subscriptionEnd = timestampToIso(recruiter.subscriptionCurrentPeriodEnd)
  const trialEnd = timestampToIso(recruiter.trialEndsAt)
  const paid =
    recruiter.plan &&
    recruiter.plan !== 'free' &&
    recruiter.subscriptionStatus === 'active' &&
    subscriptionEnd &&
    new Date(subscriptionEnd).getTime() > now.getTime()
  const trial =
    recruiter.plan === 'pro' &&
    recruiter.subscriptionStatus === 'trialing' &&
    trialEnd &&
    new Date(trialEnd).getTime() > now.getTime()
  return Boolean(paid || trial || recruiter.apiPublishingEnabled === true)
}

export async function writeAuditLog(entry: {
  requestId: string
  client: ApiClient
  action: string
  resourceType: string
  resourceId: string
}) {
  const admin = getAdmin()
  await admin.firestore().collection('apiAuditLogs').add({
    requestId: entry.requestId,
    clientId: entry.client.id,
    recruiterId: entry.client.recruiterId,
    organizationId: entry.client.organizationId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    environment: entry.client.environment,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}
