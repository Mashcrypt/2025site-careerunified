import type {Handler, HandlerEvent} from '@netlify/functions'
import crypto from 'crypto'
import {invoiceCsv, listApiInvoices} from './_apiBilling'
import {getAdmin} from './_firebaseAdmin'
import {getActiveBursaries, getActiveJobs, getBursaryBySlug, getJobBySlug} from '../lib/sanity'
import {
  ApiClient,
  ApiError,
  API_PLAN_MONTHLY_QUOTAS,
  apiDataCollections,
  applyPublicRateLimit,
  authenticateAdmin,
  authenticateApiClient,
  authenticateApiPartner,
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
  monthlyQuotaForClient,
  paginate,
  parseJsonBody,
  parseLimit,
  requestId,
  recordApiHealth,
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
  listWebhookDeliveries,
  listWebhookEndpoints,
  replayWebhookEvent,
  rotateWebhookSecret,
  sendWebhookTest,
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

async function publicApiStatus() {
  const db = getAdmin().firestore()
  const health = await db.doc(`apiHealthDaily/${today()}`).get()
  const data = health.data() || {}
  const totalRequests = Number(data.totalRequests || 0)
  const serverErrors = Number(data.serverErrors || 0)
  const errorRate = totalRequests > 0 ? serverErrors / totalRequests : 0
  const averageLatencyMs =
    totalRequests > 0 ? Math.round(Number(data.totalLatencyMs || 0) / totalRequests) : 0
  const [pendingWebhooks, failedWebhooks] = await Promise.all([
    db.collection('apiWebhookEvents').where('status', '==', 'pending').limit(100).get(),
    db.collection('apiWebhookEvents').where('status', '==', 'failed').limit(100).get(),
  ])
  const status = errorRate >= 0.05 || failedWebhooks.size >= 10 ? 'degraded' : 'available'
  return {
    status,
    version: 'v1',
    checkedAt: new Date().toISOString(),
    components: {
      api: {
        status: errorRate >= 0.05 ? 'degraded' : 'available',
        averageLatencyMs,
        errorRate: Number(errorRate.toFixed(4)),
      },
      webhooks: {
        status: failedWebhooks.size >= 10 ? 'degraded' : 'available',
        pending: pendingWebhooks.size,
        failed: failedWebhooks.size,
      },
    },
  }
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
  const collections = apiDataCollections(client.environment)
  const {snapshot: recruiterSnapshot, companyProfile} = await recruiterContext(client)
  const job = validatePartnerJob(body, companyProfile)
  const idempotencyId = crypto
    .createHash('sha256')
    .update(`${client.id}:${idempotencyKey}`, 'utf8')
    .digest('hex')
  const requestHash = crypto.createHash('sha256').update(stableJson(body), 'utf8').digest('hex')
  const idempotencyRef = db.doc(`${collections.idempotency}/${idempotencyId}`)
  const jobRef = db
    .collection(collections.jobs)
    .doc(`${client.environment === 'test' ? 'test' : 'api'}_${idempotencyId.slice(0, 24)}`)
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
    const hasPlanAccess =
      client.environment === 'test' ? true : hasActiveRecruiterAccess(current, now)
    const credits = Math.max(0, Number(current.singleJobCredits || 0))
    if (!hasPlanAccess && credits < 1) {
      throw new ApiError(
        402,
        'publishing_access_required',
        'An active recruiter package, API publishing agreement, or single-job credit is required.',
      )
    }
    const consumeCredit = client.environment === 'live' && !hasPlanAccess
    const data: Record<string, unknown> = {
      ...job,
      slug,
      recruiterId: client.recruiterId,
      organizationId: client.organizationId,
      source: client.environment === 'test' ? 'partner_api_sandbox' : 'partner_api',
      apiEnvironment: client.environment,
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
        environment: client.environment,
        clientId: client.id,
        event: 'job.published',
        data: {jobId: jobRef.id, slug, status: 'active'},
      }),
    ])
  }
  const responseJob = canonicalJobFromFirestore(jobRef.id, created.data() || {}, SITE_URL)
  if (client.environment === 'test') {
    responseJob.source = 'career_unified_sandbox'
    responseJob.application = {...responseJob.application, url: null}
    responseJob.links = {...responseJob.links, web: null}
  }
  return success(201, id, responseJob, {
    meta: {
      usedSingleJobCredit: transactionResult.useSingleJobCredit,
      idempotentReplay: transactionResult.replayed,
      environment: client.environment,
    },
  })
}

async function ownedJob(client: ApiClient, jobId: string) {
  const collections = apiDataCollections(client.environment)
  const ref = getAdmin()
    .firestore()
    .doc(`${collections.jobs}/${validResourceId(jobId, 'job')}`)
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
      environment: client.environment,
      clientId: client.id,
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
      environment: client.environment,
      clientId: client.id,
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
    .collection(apiDataCollections(client.environment).applications)
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

async function createSandboxApplication(
  event: HandlerEvent,
  id: string,
  client: ApiClient,
  jobId: string,
) {
  requireScope(client, 'applications:write')
  if (client.environment !== 'test') {
    throw new ApiError(
      403,
      'sandbox_only',
      'Synthetic applications are available only in the test environment.',
    )
  }
  const job = await ownedJob(client, jobId)
  const body = parseJsonBody(event, 50_000)
  const admin = getAdmin()
  const jobData = job.data() || {}
  const ref = admin.firestore().collection(apiDataCollections('test').applications).doc()
  const now = admin.firestore.Timestamp.now()
  await ref.set({
    jobId: job.id,
    recruiterId: client.recruiterId,
    organizationId: client.organizationId,
    apiEnvironment: 'test',
    status: 'submitted',
    candidateSnapshot: {
      fullName: cleanText(body.candidate?.name, 160) || 'Sandbox Candidate',
      email: cleanText(body.candidate?.email, 254) || 'sandbox@example.com',
      phone: cleanText(body.candidate?.phone, 50),
      location: cleanText(body.candidate?.location, 180) || 'Johannesburg, South Africa',
      qualification: cleanText(body.candidate?.qualification, 180) || 'Test qualification',
    },
    jobSnapshot: {
      title: cleanText(jobData.title, 220),
      company: cleanText(jobData.company, 180),
      location: cleanText(jobData.location, 180),
    },
    answers: Array.isArray(body.answers) ? body.answers.slice(0, 20) : [],
    submittedAt: now,
    updatedAt: now,
  })
  await enqueuePartnerWebhook({
    recruiterId: client.recruiterId,
    environment: 'test',
    clientId: client.id,
    event: 'application.received',
    data: {applicationId: ref.id, jobId: job.id, status: 'submitted'},
  })
  return success(201, id, applicationSummary(ref.id, (await ref.get()).data() || {}), {
    meta: {environment: 'test', synthetic: true},
  })
}

async function ownedApplication(client: ApiClient, applicationId: string) {
  const collections = apiDataCollections(client.environment)
  const ref = getAdmin()
    .firestore()
    .doc(`${collections.applications}/${validResourceId(applicationId, 'application')}`)
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
      environment: client.environment,
      clientId: client.id,
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
    return success(200, id, await listWebhookEndpoints(client.recruiterId, client.environment))
  }
  if (parts.length === 1 && event.httpMethod === 'POST') {
    const body = parseJsonBody(event, 50_000)
    const created = await createWebhookEndpoint({
      recruiterId: client.recruiterId,
      organizationId: client.organizationId,
      clientId: client.id,
      environment: client.environment,
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
  if (parts.length === 3 && parts[2] === 'deliveries' && event.httpMethod === 'GET') {
    const endpointId = validResourceId(parts[1], 'webhook')
    return success(
      200,
      id,
      await listWebhookDeliveries(client.recruiterId, client.environment, endpointId),
    )
  }
  if (parts.length === 3 && parts[2] === 'rotate-secret' && event.httpMethod === 'POST') {
    const endpointId = validResourceId(parts[1], 'webhook')
    const rotated = await rotateWebhookSecret(client.recruiterId, client.environment, endpointId)
    await writeAuditLog({
      requestId: id,
      client,
      action: 'webhook.secret_rotate',
      resourceType: 'webhook',
      resourceId: endpointId,
    })
    return success(200, id, {
      ...rotated,
      notice: 'Store this signing secret securely. It will not be shown again.',
    })
  }
  if (parts.length === 3 && parts[2] === 'test' && event.httpMethod === 'POST') {
    const endpointId = validResourceId(parts[1], 'webhook')
    return success(
      200,
      id,
      await sendWebhookTest(client.recruiterId, client.environment, endpointId),
    )
  }
  if (
    parts.length === 4 &&
    parts[1] === 'events' &&
    parts[3] === 'replay' &&
    event.httpMethod === 'POST'
  ) {
    const eventId = validResourceId(parts[2], 'webhook event')
    const replayed = await replayWebhookEvent(client.recruiterId, client.environment, eventId)
    await writeAuditLog({
      requestId: id,
      client,
      action: 'webhook.replay',
      resourceType: 'webhook_event',
      resourceId: eventId,
    })
    return success(202, id, replayed)
  }
  if (parts.length === 2 && event.httpMethod === 'DELETE') {
    const endpointId = validResourceId(parts[1], 'webhook')
    await disableWebhookEndpoint(client.recruiterId, client.environment, endpointId)
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
  const apiPlan = cleanText(data.apiPlan, 40).toLowerCase() || 'pilot'
  const environment = cleanText(data.environment, 20).toLowerCase() === 'test' ? 'test' : 'live'
  return {
    id,
    name: cleanText(data.name, 160),
    recruiterId: cleanText(data.recruiterId, 160),
    organizationId: cleanText(data.organizationId, 160),
    scopes: cleanStringArray(data.scopes, 80, 20),
    active: data.active === true,
    environment,
    apiPlan,
    monthlyQuota: monthlyQuotaForClient(data),
    billingMode: cleanText(data.billingMode, 40) || 'included',
    overageRateCents: Number(data.overageRateCents || 0),
    alertEmails: cleanStringArray(data.alertEmails, 254, 10),
    keyPrefix: cleanText(data.keyPrefix, 80),
    allowedOrigins: cleanStringArray(data.allowedOrigins, 500, 20),
    rateLimitPerMinute: Number(data.rateLimitPerMinute || 600),
    createdAt: timestampToIso(data.createdAt),
    rotatedAt: timestampToIso(data.rotatedAt),
    previousKeyExpiresAt: timestampToIso(data.previousKeyExpiresAt),
    previousKeyLastUsedAt: timestampToIso(data.previousKeyLastUsedAt),
    revokedAt: timestampToIso(data.revokedAt),
    lastUsedAt: timestampToIso(data.lastUsedAt),
  }
}

function normalizedApiEnvironment(value: unknown) {
  const environment = cleanText(value, 20).toLowerCase()
  if (!environment || environment === 'live') return 'live'
  if (environment === 'test' || environment === 'sandbox') return 'test'
  throw new ApiError(400, 'invalid_environment', 'API environment must be live or test.')
}

function normalizedApiPlan(value: unknown) {
  const plan = cleanText(value, 40).toLowerCase() || 'pilot'
  if (!API_PLAN_MONTHLY_QUOTAS[plan]) {
    throw new ApiError(400, 'invalid_api_plan', 'Select a valid API plan.')
  }
  return plan
}

function normalizedMonthlyQuota(value: unknown, apiPlan: string) {
  if (value === undefined || value === null || value === '') return API_PLAN_MONTHLY_QUOTAS[apiPlan]
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5_000_000) {
    throw new ApiError(
      400,
      'invalid_monthly_quota',
      'Monthly quota must be a whole number between 0 and 5000000.',
    )
  }
  return parsed
}

function normalizedBillingMode(value: unknown) {
  const mode = cleanText(value, 40).toLowerCase() || 'included'
  if (!['included', 'usage', 'manual'].includes(mode)) {
    throw new ApiError(
      400,
      'invalid_billing_mode',
      'Billing mode must be included, usage, or manual.',
    )
  }
  return mode
}

function normalizeOverageRate(value: unknown) {
  if (value === undefined || value === null || value === '') return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) {
    throw new ApiError(400, 'invalid_overage_rate', 'Overage rate must be a whole cent amount.')
  }
  return parsed
}

function normalizedAlertEmails(value: unknown) {
  const emails = cleanStringArray(value, 254, 10).map((email) => email.toLowerCase())
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new ApiError(
      400,
      'invalid_alert_email',
      'API alert recipients must be valid email addresses.',
    )
  }
  return emails
}

function daysBetween(start: Date, end: Date) {
  const days: string[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  while (cursor <= stop && days.length <= 92) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

function usageRange(event: HandlerEvent) {
  const requestedMonth = cleanText(event.queryStringParameters?.month, 20)
  if (requestedMonth) {
    if (!/^\d{4}-\d{2}$/.test(requestedMonth)) {
      throw new ApiError(400, 'invalid_month', 'Month must use YYYY-MM format.')
    }
    const start = new Date(`${requestedMonth}-01T00:00:00Z`)
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
    return {month: requestedMonth, days: daysBetween(start, end)}
  }

  const now = new Date()
  const month = now.toISOString().slice(0, 7)
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return {month, days: daysBetween(start, now)}
}

async function usageSummary(clientId: string, event: HandlerEvent) {
  const admin = getAdmin()
  const db = admin.firestore()
  const {month, days} = usageRange(event)
  const [monthlySnap, ...dailySnaps] = await db.getAll(
    db.doc(`apiUsageMonthly/${clientId}_${month}`),
    ...days.map((day) => db.doc(`apiUsageDaily/${clientId}_${day}`)),
  )
  const monthly = monthlySnap.exists ? monthlySnap.data() || {} : {}
  const daily = dailySnaps.map((snap: any, index: number) => {
    const data = snap.exists ? snap.data() || {} : {}
    return {
      day: days[index],
      requestCount: Number(data.requestCount || 0),
      lastRequestId: cleanText(data.lastRequestId, 120) || null,
      updatedAt: timestampToIso(data.updatedAt),
    }
  })
  return {
    month,
    monthly: {
      requestCount: Number(monthly.requestCount || 0),
      monthlyQuota: Number(monthly.monthlyQuota || 0),
      environment: cleanText(monthly.environment, 20) || null,
      lastRequestId: cleanText(monthly.lastRequestId, 120) || null,
      updatedAt: timestampToIso(monthly.updatedAt),
    },
    daily,
  }
}

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

async function usageCsv(clientId: string, event: HandlerEvent) {
  const summary = await usageSummary(clientId, event)
  const rows = [
    ['day', 'request_count', 'last_request_id', 'updated_at'],
    ...summary.daily.map((day) => [
      day.day,
      String(day.requestCount),
      day.lastRequestId || '',
      day.updatedAt || '',
    ]),
  ]
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}

async function clientAlerts(clientId: string) {
  const snapshot = await getAdmin()
    .firestore()
    .collection('apiAlerts')
    .where('clientId', '==', clientId)
    .limit(50)
    .get()
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {}
      return {
        id: doc.id,
        type: cleanText(data.type, 80),
        severity: cleanText(data.severity, 40),
        message: cleanText(data.message, 500),
        acknowledged: data.acknowledged === true,
        createdAt: timestampToIso(data.createdAt),
      }
    })
    .sort((left, right) =>
      String(right.createdAt || '').localeCompare(String(left.createdAt || '')),
    )
}

async function adminClientRoutes(event: HandlerEvent, id: string, parts: string[]) {
  const adminUser = await authenticateAdmin(event)
  const admin = getAdmin()
  const db = admin.firestore()
  if (parts.length === 2 && event.httpMethod === 'GET') {
    const snapshot = await db.collection('apiClients').limit(100).get()
    const clients = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const client = safeClientRecord(doc.id, doc.data() || {})
        const usage = await usageSummary(doc.id, event)
        return {...client, usage: usage.monthly}
      }),
    )
    return success(200, id, clients)
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
    const environment = normalizedApiEnvironment(body.environment)
    const apiPlan = normalizedApiPlan(body.apiPlan)
    const monthlyQuota = normalizedMonthlyQuota(body.monthlyQuota, apiPlan)
    const billingMode = normalizedBillingMode(body.billingMode)
    const overageRateCents = normalizeOverageRate(body.overageRateCents)
    const alertEmails = normalizedAlertEmails(body.alertEmails)
    const rateLimitPerMinute = requestedRateLimit
    const ref = db.collection('apiClients').doc()
    const credential = createApiCredential(ref.id, environment)
    await ref.set({
      name,
      recruiterId,
      organizationId: recruiterId,
      scopes,
      allowedOrigins,
      rateLimitPerMinute,
      monthlyQuota,
      apiPlan,
      billingMode,
      overageRateCents,
      alertEmails,
      environment,
      active: true,
      keyHash: credential.keyHash,
      keyPrefix: credential.keyPrefix,
      createdBy: adminUser.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    await recruiter.ref.set(
      {
        apiSelfServiceEnabled: true,
        apiSelfServiceEnabledAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    return success(201, id, {
      client: safeClientRecord(ref.id, {
        name,
        recruiterId,
        organizationId: recruiterId,
        scopes,
        allowedOrigins,
        rateLimitPerMinute,
        monthlyQuota,
        apiPlan,
        billingMode,
        overageRateCents,
        alertEmails,
        environment,
        active: true,
        keyPrefix: credential.keyPrefix,
      }),
      apiKey: credential.apiKey,
      notice: 'Store this key securely. It will not be shown again.',
    })
  }
  if (parts.length === 3 && event.httpMethod === 'GET') {
    const clientId = validResourceId(parts[2], 'API client')
    const snapshot = await db.doc(`apiClients/${clientId}`).get()
    if (!snapshot.exists)
      throw new ApiError(404, 'api_client_not_found', 'The API client was not found.')
    const [usage, alerts, invoices] = await Promise.all([
      usageSummary(clientId, event),
      clientAlerts(clientId),
      listApiInvoices(clientId),
    ])
    return success(200, id, {
      client: safeClientRecord(snapshot.id, snapshot.data() || {}),
      usage,
      alerts,
      invoices,
    })
  }
  if (parts.length === 4 && parts[3] === 'usage' && event.httpMethod === 'GET') {
    const clientId = validResourceId(parts[2], 'API client')
    const snapshot = await db.doc(`apiClients/${clientId}`).get()
    if (!snapshot.exists)
      throw new ApiError(404, 'api_client_not_found', 'The API client was not found.')
    return success(200, id, await usageSummary(clientId, event))
  }
  if (parts.length === 4 && parts[3] === 'usage.csv' && event.httpMethod === 'GET') {
    const clientId = validResourceId(parts[2], 'API client')
    const snapshot = await db.doc(`apiClients/${clientId}`).get()
    if (!snapshot.exists)
      throw new ApiError(404, 'api_client_not_found', 'The API client was not found.')
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="career-unified-api-usage-${clientId}.csv"`,
        'X-API-Version': 'v1',
        'X-Request-Id': id,
        'Cache-Control': 'private, no-store',
      },
      body: await usageCsv(clientId, event),
    }
  }
  if (parts.length === 4 && parts[3] === 'rotate' && event.httpMethod === 'POST') {
    const clientId = validResourceId(parts[2], 'API client')
    const ref = db.doc(`apiClients/${clientId}`)
    const snapshot = await ref.get()
    if (!snapshot.exists)
      throw new ApiError(404, 'api_client_not_found', 'The API client was not found.')
    const data = snapshot.data() || {}
    const body = parseJsonBody(event, 10_000)
    const requestedGraceHours = Number(body.graceHours ?? 24)
    if (
      !Number.isInteger(requestedGraceHours) ||
      requestedGraceHours < 1 ||
      requestedGraceHours > 168
    ) {
      throw new ApiError(
        400,
        'invalid_grace_period',
        'Rotation grace must be between 1 and 168 hours.',
      )
    }
    const environment = normalizedApiEnvironment(data.environment)
    const credential = createApiCredential(clientId, environment)
    const previousKeyExpiresAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + requestedGraceHours * 60 * 60 * 1000,
    )
    await ref.set(
      {
        previousKeyHash: cleanText(data.keyHash, 128),
        previousKeyPrefix: cleanText(data.keyPrefix, 80),
        previousKeyExpiresAt,
        keyHash: credential.keyHash,
        keyPrefix: credential.keyPrefix,
        active: true,
        rotatedBy: adminUser.uid,
        rotatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    return success(200, id, {
      client: safeClientRecord(clientId, {
        ...data,
        keyPrefix: credential.keyPrefix,
        active: true,
        environment,
      }),
      apiKey: credential.apiKey,
      previousKeyExpiresAt: previousKeyExpiresAt.toDate().toISOString(),
      notice:
        'Store this rotated key securely. The previous key remains valid during the grace period.',
    })
  }
  if (parts.length === 4 && parts[3] === 'finalize-rotation' && event.httpMethod === 'POST') {
    const clientId = validResourceId(parts[2], 'API client')
    const ref = db.doc(`apiClients/${clientId}`)
    const snapshot = await ref.get()
    if (!snapshot.exists)
      throw new ApiError(404, 'api_client_not_found', 'The API client was not found.')
    await ref.set(
      {
        previousKeyHash: admin.firestore.FieldValue.delete(),
        previousKeyPrefix: admin.firestore.FieldValue.delete(),
        previousKeyExpiresAt: admin.firestore.FieldValue.delete(),
        rotationFinalizedBy: adminUser.uid,
        rotationFinalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    return success(200, id, {id: clientId, rotationFinalized: true})
  }
  if (
    parts.length === 6 &&
    parts[3] === 'alerts' &&
    parts[5] === 'acknowledge' &&
    event.httpMethod === 'POST'
  ) {
    const clientId = validResourceId(parts[2], 'API client')
    const alertId = validResourceId(parts[4], 'alert')
    const alert = await db.doc(`apiAlerts/${alertId}`).get()
    if (!alert.exists || alert.data()?.clientId !== clientId) {
      throw new ApiError(404, 'api_alert_not_found', 'The API alert was not found.')
    }
    await alert.ref.set(
      {
        acknowledged: true,
        acknowledgedBy: adminUser.uid,
        acknowledgedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    return success(200, id, {id: alertId, acknowledged: true})
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

async function partnerClientRoutes(event: HandlerEvent, id: string, parts: string[]) {
  const user = await authenticateApiPartner(event)
  const db = getAdmin().firestore()
  const recruiterId =
    user.admin === true
      ? validResourceId(event.queryStringParameters?.recruiterId, 'recruiter')
      : user.uid

  async function ownedClient(clientId: string) {
    const snapshot = await db.doc(`apiClients/${validResourceId(clientId, 'API client')}`).get()
    if (!snapshot.exists || snapshot.data()?.recruiterId !== recruiterId) {
      throw new ApiError(404, 'api_client_not_found', 'The API client was not found.')
    }
    return snapshot
  }

  if (parts.length === 2 && event.httpMethod === 'GET') {
    const snapshot = await db
      .collection('apiClients')
      .where('recruiterId', '==', recruiterId)
      .limit(50)
      .get()
    const clients = await Promise.all(
      snapshot.docs.map(async (doc) => ({
        ...safeClientRecord(doc.id, doc.data() || {}),
        usage: (await usageSummary(doc.id, event)).monthly,
      })),
    )
    return success(200, id, clients)
  }
  if (parts.length === 3 && event.httpMethod === 'GET') {
    const snapshot = await ownedClient(parts[2])
    const [usage, alerts, invoices] = await Promise.all([
      usageSummary(snapshot.id, event),
      clientAlerts(snapshot.id),
      listApiInvoices(snapshot.id),
    ])
    return success(200, id, {
      client: safeClientRecord(snapshot.id, snapshot.data() || {}),
      usage,
      alerts,
      invoices,
    })
  }
  if (parts.length === 4 && parts[3] === 'rotate' && event.httpMethod === 'POST') {
    const snapshot = await ownedClient(parts[2])
    const body = parseJsonBody(event, 10_000)
    const graceHours = Number(body.graceHours ?? 24)
    if (!Number.isInteger(graceHours) || graceHours < 1 || graceHours > 168) {
      throw new ApiError(
        400,
        'invalid_grace_period',
        'Rotation grace must be between 1 and 168 hours.',
      )
    }
    const data = snapshot.data() || {}
    const environment = normalizedApiEnvironment(data.environment)
    const credential = createApiCredential(snapshot.id, environment)
    const previousKeyExpiresAt = getAdmin().firestore.Timestamp.fromMillis(
      Date.now() + graceHours * 60 * 60 * 1000,
    )
    await snapshot.ref.set(
      {
        previousKeyHash: cleanText(data.keyHash, 128),
        previousKeyPrefix: cleanText(data.keyPrefix, 80),
        previousKeyExpiresAt,
        keyHash: credential.keyHash,
        keyPrefix: credential.keyPrefix,
        rotatedBy: user.uid,
        rotatedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
        updatedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    return success(200, id, {
      apiKey: credential.apiKey,
      previousKeyExpiresAt: previousKeyExpiresAt.toDate().toISOString(),
      notice: 'Copy the new key now. The previous key remains valid during the grace period.',
    })
  }
  if (parts.length === 4 && parts[3] === 'finalize-rotation' && event.httpMethod === 'POST') {
    const snapshot = await ownedClient(parts[2])
    await snapshot.ref.set(
      {
        previousKeyHash: getAdmin().firestore.FieldValue.delete(),
        previousKeyPrefix: getAdmin().firestore.FieldValue.delete(),
        previousKeyExpiresAt: getAdmin().firestore.FieldValue.delete(),
        rotationFinalizedBy: user.uid,
        rotationFinalizedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
        updatedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    return success(200, id, {id: snapshot.id, rotationFinalized: true})
  }
  if (parts.length === 4 && parts[3] === 'usage.csv' && event.httpMethod === 'GET') {
    const snapshot = await ownedClient(parts[2])
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="career-unified-api-usage-${snapshot.id}.csv"`,
        'X-API-Version': 'v1',
        'X-Request-Id': id,
        'Cache-Control': 'private, no-store',
      },
      body: await usageCsv(snapshot.id, event),
    }
  }
  if (
    parts.length === 5 &&
    parts[3] === 'invoices' &&
    parts[4].endsWith('.csv') &&
    event.httpMethod === 'GET'
  ) {
    const snapshot = await ownedClient(parts[2])
    const invoiceId = validResourceId(parts[4].slice(0, -4), 'invoice')
    const invoice = (await listApiInvoices(snapshot.id)).find((item) => item.id === invoiceId)
    if (!invoice) throw new ApiError(404, 'api_invoice_not_found', 'The API invoice was not found.')
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="career-unified-${invoice.id}.csv"`,
        'X-API-Version': 'v1',
        'X-Request-Id': id,
        'Cache-Control': 'private, no-store',
      },
      body: invoiceCsv(invoice),
    }
  }
  if (
    parts.length === 6 &&
    parts[3] === 'alerts' &&
    parts[5] === 'acknowledge' &&
    event.httpMethod === 'POST'
  ) {
    const snapshot = await ownedClient(parts[2])
    const alertId = validResourceId(parts[4], 'alert')
    const alert = await db.doc(`apiAlerts/${alertId}`).get()
    if (!alert.exists || alert.data()?.clientId !== snapshot.id) {
      throw new ApiError(404, 'api_alert_not_found', 'The API alert was not found.')
    }
    await alert.ref.set(
      {
        acknowledged: true,
        acknowledgedBy: user.uid,
        acknowledgedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    )
    return success(200, id, {id: alertId, acknowledged: true})
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
    await applyPublicRateLimit(event)
    return success(200, id, await publicApiStatus(), {
      origin: event.headers.origin || event.headers.Origin,
      publicRoute: true,
      cacheControl: 'public, max-age=30',
    })
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
  if (parts[0] === 'partner' && parts[1] === 'clients') return partnerClientRoutes(event, id, parts)

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
  if (
    parts[0] === 'jobs' &&
    parts.length === 4 &&
    parts[2] === 'applications' &&
    parts[3] === 'test' &&
    event.httpMethod === 'POST'
  ) {
    return createSandboxApplication(event, id, client, parts[1])
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
  const startedAt = Date.now()
  const id = requestId(event)
  let parts: string[] = []
  let isPublic = false
  let response
  try {
    parts = routeParts(event)
    isPublic = publicRoute(parts, event.httpMethod)
    response = await dispatch(event, id, parts)
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
    response = failure(apiError, id, {
      origin: event.headers.origin || event.headers.Origin,
      publicRoute: isPublic,
      extraHeaders: retryAfter,
    })
  }
  await recordApiHealth({
    requestId: id,
    method: event.httpMethod,
    route: parts.join('/') || '/',
    statusCode: response.statusCode,
    durationMs: Date.now() - startedAt,
  })
  return response
}
