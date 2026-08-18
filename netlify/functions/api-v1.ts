import type {Handler, HandlerEvent} from '@netlify/functions'
import crypto from 'crypto'
import {getAdmin} from './_firebaseAdmin'
import {getActiveBursaries, getActiveJobs, getBursaryBySlug, getJobBySlug} from '../lib/sanity'
import {
  ApiClient,
  ApiError,
  applyPublicRateLimit,
  authenticateAdmin,
  authenticateApiClient,
  canonicalBursary,
  canonicalJobFromFirestore,
  canonicalJobFromSanity,
  cleanStringArray,
  cleanText,
  createApiCredential,
  decodeCursor,
  failure,
  hasActiveRecruiterAccess,
  normalizeScopes,
  paginate,
  parseJsonBody,
  parseLimit,
  requestId,
  requireScope,
  routeParts,
  slugify,
  stableJson,
  success,
  timestampToIso,
  validResourceId,
  validatePartnerJob,
  writeAuditLog,
} from './_apiV1'
import {
  createWebhookEndpoint,
  disableWebhookEndpoint,
  enqueuePartnerWebhook,
  listWebhookEndpoints,
} from './_partnerWebhooks'

const SITE_URL = (process.env.SITE_URL || process.env.URL || 'https://careerunified.com').replace(
  /\/+$/,
  '',
)
const PUBLIC_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
const ACTIVE_APPLICATION_STATUSES = new Set([
  'submitted',
  'viewed',
  'shortlisted',
  'interview',
  'offer',
  'hired',
  'unsuccessful',
  'withdrawn',
])

function publicRoute(parts: string[], method: string) {
  return (
    method === 'GET' &&
    (parts.length === 0 ||
      parts[0] === 'status' ||
      parts[0] === 'openapi' ||
      parts[0] === 'jobs' ||
      parts[0] === 'bursaries')
  )
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function isActiveRecruiterJob(job: Record<string, any>) {
  const status = cleanText(job.status, 40).toLowerCase()
  if (status !== 'active' || job.draft === true) return false
  const deadline = cleanText(job.deadline, 40)
  return !deadline || deadline.slice(0, 10) >= today()
}

function searchableJob(job: any) {
  return [
    job.title,
    job.category,
    job.employmentType,
    job.location?.display,
    job.organization?.name,
  ]
    .map((value) => cleanText(value, 500).toLowerCase())
    .join(' ')
}

async function recruiterJobs() {
  const snapshot = await getAdmin()
    .firestore()
    .collection('jobs')
    .where('status', '==', 'active')
    .limit(300)
    .get()
  return snapshot.docs
    .filter((doc) => isActiveRecruiterJob(doc.data() || {}))
    .map((doc) => canonicalJobFromFirestore(doc.id, doc.data() || {}, SITE_URL))
}

async function findRecruiterJob(identifier: string) {
  const db = getAdmin().firestore()
  if (/^[A-Za-z0-9_-]+$/.test(identifier)) {
    const direct = await db.doc(`jobs/${identifier}`).get()
    if (direct.exists) return direct
  }
  const bySlug = await db.collection('jobs').where('slug', '==', identifier).limit(1).get()
  return bySlug.empty ? null : bySlug.docs[0]
}

function jobSortTime(job: any) {
  const value = job.dates?.posted || job.dates?.updatedAt || ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

async function listJobs(event: HandlerEvent, id: string) {
  await applyPublicRateLimit(event)
  const query = cleanText(event.queryStringParameters?.q, 200).toLowerCase()
  const category = cleanText(event.queryStringParameters?.category, 120).toLowerCase()
  const source = cleanText(event.queryStringParameters?.source, 80).toLowerCase()
  const applicationMethod = cleanText(
    event.queryStringParameters?.applicationMethod,
    30,
  ).toLowerCase()
  const limit = parseLimit(event.queryStringParameters?.limit)
  const offset = decodeCursor(event.queryStringParameters?.cursor)

  const [sanityJobs, partnerJobs] = await Promise.all([getActiveJobs(300), recruiterJobs()])
  let jobs = [
    ...sanityJobs.map((job: Record<string, any>) => canonicalJobFromSanity(job, SITE_URL)),
    ...partnerJobs,
  ]
  if (query) jobs = jobs.filter((job) => searchableJob(job).includes(query))
  if (category) jobs = jobs.filter((job) => cleanText(job.category, 120).toLowerCase() === category)
  if (source) jobs = jobs.filter((job) => cleanText(job.source, 80).toLowerCase() === source)
  if (applicationMethod) {
    jobs = jobs.filter(
      (job) => cleanText(job.application?.method, 30).toLowerCase() === applicationMethod,
    )
  }
  jobs.sort((a, b) => jobSortTime(b) - jobSortTime(a))
  const page = paginate(jobs, limit, offset)
  return success(200, id, page.data, {
    origin: event.headers.origin || event.headers.Origin,
    publicRoute: true,
    cacheControl: PUBLIC_CACHE,
    meta: {
      total: jobs.length,
      limit,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    },
  })
}

async function getJob(event: HandlerEvent, id: string, identifier: string) {
  await applyPublicRateLimit(event)
  const cleanIdentifier = cleanText(identifier, 220)
  const [sanityResult, recruiterResult] = await Promise.allSettled([
    getJobBySlug(cleanIdentifier),
    findRecruiterJob(cleanIdentifier),
  ])
  const sanityJob = sanityResult.status === 'fulfilled' ? sanityResult.value : null
  if (sanityJob) {
    return success(200, id, canonicalJobFromSanity(sanityJob, SITE_URL), {
      origin: event.headers.origin || event.headers.Origin,
      publicRoute: true,
      cacheControl: PUBLIC_CACHE,
    })
  }
  const recruiterDoc = recruiterResult.status === 'fulfilled' ? recruiterResult.value : null
  if (!recruiterDoc || !isActiveRecruiterJob(recruiterDoc.data() || {})) {
    throw new ApiError(404, 'job_not_found', 'The job could not be found.')
  }
  return success(
    200,
    id,
    canonicalJobFromFirestore(recruiterDoc.id, recruiterDoc.data() || {}, SITE_URL),
    {
      origin: event.headers.origin || event.headers.Origin,
      publicRoute: true,
      cacheControl: PUBLIC_CACHE,
    },
  )
}

async function listBursaries(event: HandlerEvent, id: string) {
  await applyPublicRateLimit(event)
  const query = cleanText(event.queryStringParameters?.q, 200).toLowerCase()
  const faculty = cleanText(event.queryStringParameters?.faculty, 120).toLowerCase()
  const limit = parseLimit(event.queryStringParameters?.limit)
  const offset = decodeCursor(event.queryStringParameters?.cursor)
  const source = await getActiveBursaries(300)
  let bursaries = source.map((item: Record<string, any>) => canonicalBursary(item, SITE_URL))
  if (query) {
    bursaries = bursaries.filter((item) =>
      [item.name, item.provider, ...item.faculties]
        .map((value) => cleanText(value, 300).toLowerCase())
        .join(' ')
        .includes(query),
    )
  }
  if (faculty)
    bursaries = bursaries.filter((item) =>
      item.faculties.some((itemFaculty) => itemFaculty.toLowerCase() === faculty),
    )
  bursaries.sort((a, b) =>
    String(a.closingDate || '9999').localeCompare(String(b.closingDate || '9999')),
  )
  const page = paginate(bursaries, limit, offset)
  return success(200, id, page.data, {
    origin: event.headers.origin || event.headers.Origin,
    publicRoute: true,
    cacheControl: PUBLIC_CACHE,
    meta: {
      total: bursaries.length,
      limit,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    },
  })
}

async function getBursary(event: HandlerEvent, id: string, identifier: string) {
  await applyPublicRateLimit(event)
  const bursary = await getBursaryBySlug(cleanText(identifier, 220))
  if (!bursary) throw new ApiError(404, 'bursary_not_found', 'The bursary could not be found.')
  return success(200, id, canonicalBursary(bursary, SITE_URL), {
    origin: event.headers.origin || event.headers.Origin,
    publicRoute: true,
    cacheControl: PUBLIC_CACHE,
  })
}

async function recruiterContext(client: ApiClient) {
  const snapshot = await getAdmin().firestore().doc(`recruiters/${client.recruiterId}`).get()
  if (!snapshot.exists) {
    throw new ApiError(
      403,
      'recruiter_not_found',
      'The API client is not linked to a recruiter account.',
    )
  }
  const recruiter = snapshot.data() || {}
  const companyProfile =
    recruiter.companyProfile && typeof recruiter.companyProfile === 'object'
      ? recruiter.companyProfile
      : {}
  return {snapshot, recruiter, companyProfile}
}

async function createPartnerJob(event: HandlerEvent, id: string, client: ApiClient) {
  requireScope(client, 'jobs:write')
  const body = parseJsonBody(event)
  const idempotencyKey = cleanText(
    event.headers['idempotency-key'] || event.headers['Idempotency-Key'],
    180,
  )
  if (!/^[A-Za-z0-9._:-]{8,180}$/.test(idempotencyKey)) {
    throw new ApiError(
      400,
      'idempotency_key_required',
      'Provide an Idempotency-Key header containing at least 8 safe characters.',
    )
  }
  const admin = getAdmin()
  const db = admin.firestore()
  const {snapshot: recruiterSnapshot, companyProfile} = await recruiterContext(client)
  const job = validatePartnerJob(body, companyProfile)
  const idempotencyId = crypto
    .createHash('sha256')
    .update(`${client.id}:${idempotencyKey}`, 'utf8')
    .digest('hex')
  const requestHash = crypto.createHash('sha256').update(stableJson(body), 'utf8').digest('hex')
  const idempotencyRef = db.doc(`apiIdempotency/${idempotencyId}`)
  const jobRef = db.collection('jobs').doc(`api_${idempotencyId.slice(0, 24)}`)
  const slug = `${slugify(`${job.title}-${job.company}-${job.city}`)}--${jobRef.id.slice(0, 6)}`
  const now = new Date()

  const transactionResult = await db.runTransaction(async (transaction) => {
    const existingRequest = await transaction.get(idempotencyRef)
    if (existingRequest.exists) {
      const existingData = existingRequest.data() || {}
      if (existingData.clientId !== client.id || existingData.requestHash !== requestHash) {
        throw new ApiError(
          409,
          'idempotency_conflict',
          'This Idempotency-Key has already been used with a different request.',
        )
      }
      return {
        useSingleJobCredit: Boolean(existingData.usedSingleJobCredit),
        replayed: true,
      }
    }

    const freshRecruiter = await transaction.get(recruiterSnapshot.ref)
    if (!freshRecruiter.exists)
      throw new ApiError(403, 'recruiter_not_found', 'The recruiter account was not found.')
    const current = freshRecruiter.data() || {}
    const hasPlanAccess = hasActiveRecruiterAccess(current, now)
    const credits = Math.max(0, Number(current.singleJobCredits || 0))
    if (!hasPlanAccess && credits < 1) {
      throw new ApiError(
        402,
        'publishing_access_required',
        'An active recruiter package, API publishing agreement, or single-job credit is required.',
      )
    }
    const consumeCredit = !hasPlanAccess
    const data: Record<string, unknown> = {
      ...job,
      slug,
      recruiterId: client.recruiterId,
      organizationId: client.organizationId,
      source: 'partner_api',
      createdByApiClientId: client.id,
      applicationsCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
    if (consumeCredit) {
      const sponsoredUntil = new Date(now)
      sponsoredUntil.setDate(sponsoredUntil.getDate() + 30)
      Object.assign(data, {
        listingTier: 'sponsored',
        badge: 'Sponsored',
        sponsoredUntil: admin.firestore.Timestamp.fromDate(sponsoredUntil),
        singleJobOffer: true,
      })
      transaction.update(recruiterSnapshot.ref, {
        singleJobCredits: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
    transaction.create(jobRef, data)
    transaction.create(idempotencyRef, {
      clientId: client.id,
      recruiterId: client.recruiterId,
      operation: 'job.create',
      requestHash,
      resourceId: jobRef.id,
      usedSingleJobCredit: consumeCredit,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return {useSingleJobCredit: consumeCredit, replayed: false}
  })

  const created = await jobRef.get()
  if (!created.exists) {
    throw new ApiError(
      409,
      'idempotency_resource_missing',
      'The original job resource is unavailable.',
    )
  }
  if (!transactionResult.replayed) {
    await Promise.all([
      writeAuditLog({
        requestId: id,
        client,
        action: 'job.create',
        resourceType: 'job',
        resourceId: jobRef.id,
      }),
      enqueuePartnerWebhook({
        recruiterId: client.recruiterId,
        event: 'job.published',
        data: {jobId: jobRef.id, slug, status: 'active'},
      }),
    ])
  }
  return success(201, id, canonicalJobFromFirestore(jobRef.id, created.data() || {}, SITE_URL), {
    meta: {
      usedSingleJobCredit: transactionResult.useSingleJobCredit,
      idempotentReplay: transactionResult.replayed,
    },
  })
}

async function ownedJob(client: ApiClient, jobId: string) {
  const ref = getAdmin()
    .firestore()
    .doc(`jobs/${validResourceId(jobId, 'job')}`)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.data()?.recruiterId !== client.recruiterId) {
    throw new ApiError(404, 'job_not_found', 'The job could not be found.')
  }
  return snapshot
}

async function updatePartnerJob(event: HandlerEvent, id: string, client: ApiClient, jobId: string) {
  requireScope(client, 'jobs:write')
  const existing = await ownedJob(client, jobId)
  const body = parseJsonBody(event)
  const {companyProfile} = await recruiterContext(client)
  const current = existing.data() || {}
  const merged = {...current, ...body}
  if (Object.prototype.hasOwnProperty.call(body, 'closingDate')) merged.deadline = body.closingDate
  if (Object.prototype.hasOwnProperty.call(body, 'closingText'))
    merged.deadlineText = body.closingText
  const job = validatePartnerJob(merged, companyProfile)
  const admin = getAdmin()
  const status = cleanText(current.status, 40) === 'closed' ? 'closed' : 'active'
  await existing.ref.set(
    {
      ...job,
      status,
      slug: cleanText(current.slug, 220),
      recruiterId: client.recruiterId,
      organizationId: client.organizationId,
      updatedByApiClientId: client.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  )
  const updated = await existing.ref.get()
  await Promise.all([
    writeAuditLog({
      requestId: id,
      client,
      action: 'job.update',
      resourceType: 'job',
      resourceId: existing.id,
    }),
    enqueuePartnerWebhook({
      recruiterId: client.recruiterId,
      event: 'job.updated',
      data: {jobId: existing.id, slug: current.slug, status},
    }),
  ])
  return success(200, id, canonicalJobFromFirestore(existing.id, updated.data() || {}, SITE_URL))
}

async function closePartnerJob(id: string, client: ApiClient, jobId: string) {
  requireScope(client, 'jobs:write')
  const snapshot = await ownedJob(client, jobId)
  const admin = getAdmin()
  await snapshot.ref.set(
    {
      status: 'closed',
      closedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByApiClientId: client.id,
    },
    {merge: true},
  )
  await Promise.all([
    writeAuditLog({
      requestId: id,
      client,
      action: 'job.close',
      resourceType: 'job',
      resourceId: snapshot.id,
    }),
    enqueuePartnerWebhook({
      recruiterId: client.recruiterId,
      event: 'job.closed',
      data: {jobId: snapshot.id, slug: snapshot.data()?.slug || null, status: 'closed'},
    }),
  ])
  return success(200, id, {id: snapshot.id, status: 'closed'})
}

function applicationSummary(id: string, application: Record<string, any>) {
  const candidate = application.candidateSnapshot || {}
  const job = application.jobSnapshot || {}
  return {
    id,
    jobId: cleanText(application.jobId, 180),
    status: cleanText(application.status, 40),
    screeningResult: cleanText(application.screeningResult, 80) || null,
    submittedAt: timestampToIso(application.submittedAt),
    updatedAt: timestampToIso(application.updatedAt),
    candidate: {
      name: cleanText(candidate.fullName, 160),
      email: cleanText(candidate.email, 254),
      phone: cleanText(candidate.phone, 50) || null,
      location: cleanText(candidate.location, 180) || null,
      qualification: cleanText(candidate.qualification, 180) || null,
    },
    job: {
      title: cleanText(job.title, 220),
      company: cleanText(job.company, 180),
      location: cleanText(job.location, 180),
    },
    links: {self: `${SITE_URL}/api/v1/applications/${encodeURIComponent(id)}`},
  }
}

async function listApplications(event: HandlerEvent, id: string, client: ApiClient, jobId: string) {
  requireScope(client, 'applications:read')
  const job = await ownedJob(client, jobId)
  const limit = parseLimit(event.queryStringParameters?.limit, 25, 100)
  const offset = decodeCursor(event.queryStringParameters?.cursor)
  const status = cleanText(event.queryStringParameters?.status, 40).toLowerCase()
  const snapshot = await getAdmin()
    .firestore()
    .collection('applications')
    .where('jobId', '==', job.id)
    .limit(500)
    .get()
  let applications = snapshot.docs
    .filter((doc) => doc.data()?.recruiterId === client.recruiterId)
    .map((doc) => applicationSummary(doc.id, doc.data() || {}))
  if (status) applications = applications.filter((application) => application.status === status)
  applications.sort((a, b) =>
    String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')),
  )
  const page = paginate(applications, limit, offset)
  return success(200, id, page.data, {
    meta: {total: applications.length, limit, hasMore: page.hasMore, nextCursor: page.nextCursor},
  })
}

async function ownedApplication(client: ApiClient, applicationId: string) {
  const ref = getAdmin()
    .firestore()
    .doc(`applications/${validResourceId(applicationId, 'application')}`)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.data()?.recruiterId !== client.recruiterId) {
    throw new ApiError(404, 'application_not_found', 'The application could not be found.')
  }
  return snapshot
}

async function getApplication(id: string, client: ApiClient, applicationId: string) {
  requireScope(client, 'applications:read')
  const snapshot = await ownedApplication(client, applicationId)
  const data = snapshot.data() || {}
  const summary = applicationSummary(snapshot.id, data)
  return success(200, id, {
    ...summary,
    answers: Array.isArray(data.answers)
      ? data.answers.map((answer: Record<string, unknown>) => ({
          questionId: cleanText(answer.questionId, 100),
          label: cleanText(answer.label, 240),
          type: cleanText(answer.type, 40),
          answer: Array.isArray(answer.answer)
            ? cleanStringArray(answer.answer, 300, 20)
            : cleanText(answer.answer, 1500),
        }))
      : [],
    coverLetter: cleanText(data.coverLetter, 4000) || null,
    cv: {
      fileName: cleanText(data.cvSnapshot?.fileName, 180) || null,
      contentType: cleanText(data.cvSnapshot?.contentType, 120) || null,
      size: Number(data.cvSnapshot?.size || 0),
    },
  })
}

async function updateApplication(
  event: HandlerEvent,
  id: string,
  client: ApiClient,
  applicationId: string,
) {
  requireScope(client, 'applications:write')
  const snapshot = await ownedApplication(client, applicationId)
  const body = parseJsonBody(event, 50_000)
  const status = cleanText(body.status, 40).toLowerCase()
  if (
    !ACTIVE_APPLICATION_STATUSES.has(status) ||
    status === 'submitted' ||
    status === 'withdrawn'
  ) {
    throw new ApiError(
      400,
      'invalid_application_status',
      'Select a valid recruiter application status.',
    )
  }
  const admin = getAdmin()
  const now = admin.firestore.Timestamp.now()
  await snapshot.ref.set(
    {
      status,
      statusHistory: admin.firestore.FieldValue.arrayUnion({status, at: now, actor: 'partner_api'}),
      ...(status === 'viewed' && !snapshot.data()?.viewedAt ? {viewedAt: now} : {}),
      updatedAt: now,
      updatedByApiClientId: client.id,
    },
    {merge: true},
  )
  await Promise.all([
    writeAuditLog({
      requestId: id,
      client,
      action: 'application.stage_change',
      resourceType: 'application',
      resourceId: snapshot.id,
    }),
    enqueuePartnerWebhook({
      recruiterId: client.recruiterId,
      event: 'application.stage_changed',
      data: {
        applicationId: snapshot.id,
        jobId: cleanText(snapshot.data()?.jobId, 180),
        previousStatus: cleanText(snapshot.data()?.status, 40),
        status,
      },
    }),
  ])
  return success(200, id, {id: snapshot.id, status, updatedAt: now.toDate().toISOString()})
}

async function webhookRoutes(event: HandlerEvent, id: string, client: ApiClient, parts: string[]) {
  requireScope(client, 'webhooks:manage')
  if (parts.length === 1 && event.httpMethod === 'GET') {
    return success(200, id, await listWebhookEndpoints(client.recruiterId))
  }
  if (parts.length === 1 && event.httpMethod === 'POST') {
    const body = parseJsonBody(event, 50_000)
    const created = await createWebhookEndpoint({
      recruiterId: client.recruiterId,
      organizationId: client.organizationId,
      clientId: client.id,
      url: body.url,
      events: body.events,
      description: body.description,
    })
    await writeAuditLog({
      requestId: id,
      client,
      action: 'webhook.create',
      resourceType: 'webhook',
      resourceId: created.endpoint.id,
    })
    return success(201, id, created)
  }
  if (parts.length === 2 && event.httpMethod === 'DELETE') {
    const endpointId = validResourceId(parts[1], 'webhook')
    await disableWebhookEndpoint(client.recruiterId, endpointId)
    await writeAuditLog({
      requestId: id,
      client,
      action: 'webhook.disable',
      resourceType: 'webhook',
      resourceId: endpointId,
    })
    return {statusCode: 204, headers: {'X-API-Version': 'v1', 'X-Request-Id': id}, body: ''}
  }
  throw new ApiError(405, 'method_not_allowed', 'The method is not supported for this endpoint.')
}

function safeClientRecord(id: string, data: Record<string, any>) {
  return {
    id,
    name: cleanText(data.name, 160),
    recruiterId: cleanText(data.recruiterId, 160),
    organizationId: cleanText(data.organizationId, 160),
    scopes: cleanStringArray(data.scopes, 80, 20),
    active: data.active === true,
    keyPrefix: cleanText(data.keyPrefix, 80),
    allowedOrigins: cleanStringArray(data.allowedOrigins, 500, 20),
    rateLimitPerMinute: Number(data.rateLimitPerMinute || 600),
    createdAt: timestampToIso(data.createdAt),
    lastUsedAt: timestampToIso(data.lastUsedAt),
  }
}

async function adminClientRoutes(event: HandlerEvent, id: string, parts: string[]) {
  const adminUser = await authenticateAdmin(event)
  const admin = getAdmin()
  const db = admin.firestore()
  if (parts.length === 2 && event.httpMethod === 'GET') {
    const snapshot = await db.collection('apiClients').limit(100).get()
    return success(
      200,
      id,
      snapshot.docs.map((doc) => safeClientRecord(doc.id, doc.data() || {})),
    )
  }
  if (parts.length === 2 && event.httpMethod === 'POST') {
    const body = parseJsonBody(event, 50_000)
    const recruiterId = validResourceId(body.recruiterId, 'recruiter')
    const recruiter = await db.doc(`recruiters/${recruiterId}`).get()
    if (!recruiter.exists)
      throw new ApiError(404, 'recruiter_not_found', 'The recruiter account was not found.')
    const name = cleanText(body.name, 160)
    if (!name) throw new ApiError(400, 'validation_failed', 'The API client name is required.')
    const scopes = normalizeScopes(body.scopes)
    if (!scopes.length)
      throw new ApiError(400, 'validation_failed', 'At least one API scope is required.')
    const allowedOrigins = cleanStringArray(body.allowedOrigins, 500, 20).map((origin) => {
      try {
        const url = new URL(origin)
        if (url.protocol !== 'https:') throw new Error()
        return url.origin
      } catch {
        throw new ApiError(400, 'invalid_origin', 'Allowed browser origins must use HTTPS.')
      }
    })
    const requestedRateLimit = Number(body.rateLimitPerMinute || 600)
    if (
      !Number.isFinite(requestedRateLimit) ||
      !Number.isInteger(requestedRateLimit) ||
      requestedRateLimit < 30 ||
      requestedRateLimit > 5000
    ) {
      throw new ApiError(
        400,
        'invalid_rate_limit',
        'Rate limit per minute must be a whole number between 30 and 5000.',
      )
    }
    const rateLimitPerMinute = requestedRateLimit
    const ref = db.collection('apiClients').doc()
    const credential = createApiCredential(ref.id)
    await ref.set({
      name,
      recruiterId,
      organizationId: recruiterId,
      scopes,
      allowedOrigins,
      rateLimitPerMinute,
      active: true,
      keyHash: credential.keyHash,
      keyPrefix: credential.keyPrefix,
      createdBy: adminUser.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return success(201, id, {
      client: safeClientRecord(ref.id, {
        name,
        recruiterId,
        organizationId: recruiterId,
        scopes,
        allowedOrigins,
        rateLimitPerMinute,
        active: true,
        keyPrefix: credential.keyPrefix,
      }),
      apiKey: credential.apiKey,
      notice: 'Store this key securely. It will not be shown again.',
    })
  }
  if (parts.length === 3 && event.httpMethod === 'DELETE') {
    const clientId = validResourceId(parts[2], 'API client')
    const ref = db.doc(`apiClients/${clientId}`)
    const snapshot = await ref.get()
    if (!snapshot.exists)
      throw new ApiError(404, 'api_client_not_found', 'The API client was not found.')
    await ref.set(
      {
        active: false,
        revokedBy: adminUser.uid,
        revokedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    return {statusCode: 204, headers: {'X-API-Version': 'v1', 'X-Request-Id': id}, body: ''}
  }
  throw new ApiError(405, 'method_not_allowed', 'The method is not supported for this endpoint.')
}

async function dispatch(event: HandlerEvent, id: string, parts: string[]) {
  if (event.httpMethod === 'OPTIONS') {
    const isPublic = publicRoute(parts, 'GET')
    const origin = event.headers.origin || event.headers.Origin || ''
    const allowedOrigin = isPublic
      ? origin || '*'
      : process.env.ALLOWED_ORIGIN || process.env.SITE_URL || 'null'
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-API-Key, X-Request-Id, Idempotency-Key',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
      body: '',
    }
  }

  if (parts.length === 0 && event.httpMethod === 'GET') {
    await applyPublicRateLimit(event)
    return success(
      200,
      id,
      {
        name: 'Career Unified Partner API',
        version: 'v1',
        documentation: `${SITE_URL}/api/`,
        openapi: `${SITE_URL}/api/openapi.yaml`,
        endpoints: {
          jobs: `${SITE_URL}/api/v1/jobs`,
          bursaries: `${SITE_URL}/api/v1/bursaries`,
        },
      },
      {
        origin: event.headers.origin || event.headers.Origin,
        publicRoute: true,
        cacheControl: PUBLIC_CACHE,
      },
    )
  }
  if (parts[0] === 'status' && parts.length === 1 && event.httpMethod === 'GET') {
    return success(
      200,
      id,
      {status: 'available', version: 'v1'},
      {
        origin: event.headers.origin || event.headers.Origin,
        publicRoute: true,
        cacheControl: 'public, max-age=30',
      },
    )
  }
  if (parts[0] === 'openapi' && parts.length === 1 && event.httpMethod === 'GET') {
    return success(
      200,
      id,
      {url: `${SITE_URL}/api/openapi.yaml`},
      {
        origin: event.headers.origin || event.headers.Origin,
        publicRoute: true,
        cacheControl: PUBLIC_CACHE,
      },
    )
  }
  if (parts[0] === 'jobs' && parts.length === 1 && event.httpMethod === 'GET')
    return listJobs(event, id)
  if (parts[0] === 'jobs' && parts.length === 2 && event.httpMethod === 'GET')
    return getJob(event, id, parts[1])
  if (parts[0] === 'bursaries' && parts.length === 1 && event.httpMethod === 'GET')
    return listBursaries(event, id)
  if (parts[0] === 'bursaries' && parts.length === 2 && event.httpMethod === 'GET')
    return getBursary(event, id, parts[1])
  if (parts[0] === 'admin' && parts[1] === 'clients') return adminClientRoutes(event, id, parts)

  const client = await authenticateApiClient(event, id)
  if (parts[0] === 'jobs' && parts.length === 1 && event.httpMethod === 'POST') {
    return createPartnerJob(event, id, client)
  }
  if (parts[0] === 'jobs' && parts.length === 2 && event.httpMethod === 'PATCH') {
    return updatePartnerJob(event, id, client, parts[1])
  }
  if (
    parts[0] === 'jobs' &&
    parts.length === 3 &&
    parts[2] === 'close' &&
    event.httpMethod === 'POST'
  ) {
    return closePartnerJob(id, client, parts[1])
  }
  if (
    parts[0] === 'jobs' &&
    parts.length === 3 &&
    parts[2] === 'applications' &&
    event.httpMethod === 'GET'
  ) {
    return listApplications(event, id, client, parts[1])
  }
  if (parts[0] === 'applications' && parts.length === 2 && event.httpMethod === 'GET') {
    return getApplication(id, client, parts[1])
  }
  if (parts[0] === 'applications' && parts.length === 2 && event.httpMethod === 'PATCH') {
    return updateApplication(event, id, client, parts[1])
  }
  if (parts[0] === 'webhooks') return webhookRoutes(event, id, client, parts)
  throw new ApiError(404, 'endpoint_not_found', 'The API endpoint could not be found.')
}

export const handler: Handler = async (event) => {
  const id = requestId(event)
  let parts: string[] = []
  let isPublic = false
  try {
    parts = routeParts(event)
    isPublic = publicRoute(parts, event.httpMethod)
    return await dispatch(event, id, parts)
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(500, 'internal_error', 'The request could not be completed.')
    if (!(error instanceof ApiError)) console.error('PARTNER_API_ERROR', {requestId: id, error})
    const retryAfter =
      apiError.statusCode === 429 && (apiError.details as any)?.retryAfterSeconds
        ? {'Retry-After': String((apiError.details as any).retryAfterSeconds)}
        : undefined
    return failure(apiError, id, {
      origin: event.headers.origin || event.headers.Origin,
      publicRoute: isPublic,
      extraHeaders: retryAfter,
    })
  }
}
