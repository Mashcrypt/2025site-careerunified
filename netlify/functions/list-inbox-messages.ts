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
import {assertIntegrationPermission} from './_recruiterIntegrations'

function timestampValue(value: any) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: corsHeaders(origin), body: ''}
  }
  if (event.httpMethod !== 'GET') {
    return json(405, origin, {error: 'Method Not Allowed'})
  }

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
    assertIntegrationPermission(decoded, companyId, 'read_email')

    const db = admin.firestore()
    const params = event.queryStringParameters || {}
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 50, 1), 100)
    const pageToken = cleanText(params.pageToken || '', 200)
    const providerId = cleanText(params.providerId || '', 40).toLowerCase()
    const direction = cleanText(params.direction || '', 20).toLowerCase()
    const read = params.read ? params.read === 'true' : undefined
    const candidateId = cleanText(params.candidateId || '', 180)
    const applicationId = cleanText(params.applicationId || '', 180)
    const jobId = cleanText(params.jobId || '', 180)
    const since = params.since ? cleanText(params.since, 80) : undefined
    const until = params.until ? cleanText(params.until, 80) : undefined

    let query = db.collection('recruiterInboxMessages').where('companyId', '==', companyId)

    if (providerId) query = query.where('providerId', '==', providerId)
    if (direction) query = query.where('direction', '==', direction)
    if (read !== undefined) query = query.where('isRead', '==', read)
    if (candidateId) query = query.where('candidateId', '==', candidateId)
    if (applicationId) query = query.where('applicationId', '==', applicationId)
    if (jobId) query = query.where('jobId', '==', jobId)
    if (since) query = query.where('receivedAt', '>=', since)
    if (until) query = query.where('receivedAt', '<=', until)

    query = query.orderBy('receivedAt', 'desc').limit(pageSize + 1)

    if (pageToken) {
      const tokenDoc = await db.collection('recruiterInboxMessages').doc(pageToken).get()
      if (tokenDoc.exists) {
        query = query.startAfter(tokenDoc)
      }
    }

    const snapshot = await query.get()
    const messages = snapshot.docs.slice(0, pageSize).map((doc: any) => {
      const data = doc.data() || {}
      return {
        id: doc.id,
        providerId: data.providerId,
        providerAccountId: data.providerAccountId,
        providerMessageId: data.providerMessageId,
        providerThreadId: data.providerThreadId,
        candidateId: data.candidateId || '',
        applicationId: data.applicationId || '',
        jobId: data.jobId || '',
        sender: data.sender || {email: '', name: ''},
        recipients: data.recipients || [],
        subject: data.subject || '',
        textBody: data.textBody || '',
        htmlBody: data.htmlBody || '',
        sanitizedHtmlBody: data.sanitizedHtmlBody || '',
        attachments: data.attachments || [],
        isRead: data.isRead === true,
        direction: data.direction || 'received',
        receivedAt: timestampValue(data.receivedAt),
        sentAt: timestampValue(data.sentAt),
        syncedAt: timestampValue(data.syncedAt),
        labels: data.labels || [],
        inReplyTo: data.inReplyTo || '',
        references: data.references || '',
        messageIdHeader: data.messageIdHeader || '',
      }
    })

    const nextPageToken = snapshot.docs.length > pageSize ? snapshot.docs[pageSize].id : null

    return json(200, origin, {messages, nextPageToken})
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message})
    }
    console.error('LIST_INBOX_MESSAGES_ERROR', error)
    return json(500, origin, {error: 'Could not load inbox messages. Please try again.'})
  }
}