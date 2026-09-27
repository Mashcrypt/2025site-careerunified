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
import {refreshAccessToken} from './_connectedEmail'

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

async function getEmailRecord(admin: any, companyId: string, providerId: string) {
  const snap = await admin.firestore().doc(`recruiterIntegrations/${companyId}_${providerId}`).get()
  if (!snap.exists) throw new ApplicationError(404, `${providerId} not connected.`)
  const record = snap.data() || {}
  if (record.connectionStatus !== 'connected') {
    throw new ApplicationError(409, `${providerId} is not connected. Connect it in Integrations first.`)
  }
  return record
}

export function sanitizeHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
}

export function extractEmailAddress(header: string) {
  const match = header.match(/<([^>]+)>/) || header.match(/([^\s]+@[^\s]+)/)
  return match ? match[1].toLowerCase() : header.toLowerCase()
}

export function extractName(header: string) {
  const match = header.match(/^([^<]+)</)
  return match ? match[1].trim() : ''
}

export async function matchMessageToCandidateAndApplication(admin: any, companyId: string, message: any) {
  const senderEmail = message.sender?.email?.toLowerCase()
  const recipientEmails = (message.recipients || []).map((r: any) => r.email?.toLowerCase()).filter(Boolean)
  const allEmails = [senderEmail, ...recipientEmails].filter(Boolean)

  if (!allEmails.length) return {candidateId: '', applicationId: '', jobId: ''}

  const db = admin.firestore()

  // Try to find candidate by email
  let candidateId = ''
  let applicationId = ''
  let jobId = ''

  // First, try to find a candidate with matching email
  for (const email of allEmails) {
    const candidateSnap = await db.collection('users').where('email', '==', email).limit(1).get()
    if (!candidateSnap.empty) {
      candidateId = candidateSnap.docs[0].id
      break
    }
  }

  // If we found a candidate, try to find an application for this company
  if (candidateId) {
    const appSnap = await db.collection('applications')
      .where('candidateId', '==', candidateId)
      .where('recruiterId', '==', companyId)
      .orderBy('submittedAt', 'desc')
      .limit(1)
      .get()
    if (!appSnap.empty) {
      const app = appSnap.docs[0].data() || {}
      applicationId = appSnap.docs[0].id
      jobId = app.jobId || ''
    }
  }

  // If no candidate found, try to match by thread/message references to existing messages
  if (!candidateId && message.providerThreadId) {
    const threadSnap = await db.collection('recruiterInboxMessages')
      .where('companyId', '==', companyId)
      .where('providerThreadId', '==', message.providerThreadId)
      .where('candidateId', '!=', '')
      .limit(1)
      .get()
    if (!threadSnap.empty) {
      const threadMsg = threadSnap.docs[0].data() || {}
      candidateId = threadMsg.candidateId || ''
      applicationId = threadMsg.applicationId || ''
      jobId = threadMsg.jobId || ''
    }
  }

  // If still no match, try to match by message references (In-Reply-To, References)
  if (!candidateId && (message.inReplyTo || message.references)) {
    const refIds = [message.inReplyTo, ...(message.references || '').split(' ')].filter(Boolean)
    for (const refId of refIds) {
      const refSnap = await db.collection('recruiterInboxMessages')
        .where('companyId', '==', companyId)
        .where('messageIdHeader', '==', refId)
        .where('candidateId', '!=', '')
        .limit(1)
        .get()
      if (!refSnap.empty) {
        const refMsg = refSnap.docs[0].data() || {}
        candidateId = refMsg.candidateId || ''
        applicationId = refMsg.applicationId || ''
        jobId = refMsg.jobId || ''
        break
      }
    }
  }

  return {candidateId, applicationId, jobId}
}

async function syncGmailMessages(admin: any, companyId: string, record: any, options: {since?: number; maxResults?: number} = {}) {
  const since = options.since || Date.now() - 7 * 24 * 60 * 60 * 1000
  const maxResults = Math.min(Math.max(options.maxResults || 100, 1), 500)
  const query = `after:${Math.floor(since / 1000)}`

  let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`
  const response = await providerFetch(admin, record, {url})
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`gmail_sync_${response.status}`)

  const messages = (payload.messages || []).slice(0, maxResults)
  const syncedMessages = []

  for (const m of messages) {
    try {
      const resp = await providerFetch(admin, record, {
        url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=full`,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) continue

      const headers: Record<string, string> = {}
      data.payload?.headers?.forEach((h: any) => {
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
      extractBody(data.payload)

      const fromHeader = headers.from || ''
      const toHeader = headers.to || ''
      const subject = headers.subject || ''
      const messageId = headers['message-id'] || ''
      const inReplyTo = headers['in-reply-to'] || ''
      const references = headers.references || ''
      const dateHeader = headers.date || ''

      const fromEmail = extractEmailAddress(fromHeader)
      const fromName = extractName(fromHeader)
      const toEmails = toHeader.split(',').map(extractEmailAddress).filter(Boolean)

      const direction = fromEmail === record.providerEmail ? 'sent' : 'received'

      const baseMessageDoc = {
        companyId,
        providerId: 'gmail',
        providerAccountId: record.providerAccountId,
        providerMessageId: data.id,
        providerThreadId: data.threadId,
        candidateId: '',
        applicationId: '',
        jobId: '',
        sender: {email: fromEmail, name: fromName},
        recipients: toEmails.map(e => ({email: e})),
        subject,
        textBody: textBody.slice(0, 10000),
        htmlBody: htmlBody.slice(0, 20000),
        sanitizedHtmlBody: sanitizeHtml(htmlBody).slice(0, 20000),
        isRead: !data.labelIds?.includes('UNREAD'),
        direction,
        receivedAt: data.internalDate ? new Date(Number(data.internalDate)).toISOString() : new Date().toISOString(),
        sentAt: direction === 'sent' && data.internalDate ? new Date(Number(data.internalDate)).toISOString() : null,
        syncedAt: new Date().toISOString(),
        labels: data.labelIds || [],
        inReplyTo,
        references,
        messageIdHeader: messageId,
      }

      const match = await matchMessageToCandidateAndApplication(admin, companyId, baseMessageDoc)
      const messageDoc = {...baseMessageDoc, ...match}

      const idempotencyKey = `gmail_${record.providerAccountId}_${data.id}`
      const messageRef = admin.firestore().collection('recruiterInboxMessages').doc(idempotencyKey)
      await messageRef.set(messageDoc, {merge: true})
      syncedMessages.push({id: data.id, threadId: data.threadId, subject, from: fromEmail, direction})
    } catch (e) {
      console.error('Failed to sync Gmail message', m.id, e)
    }
  }

  await admin
    .firestore()
    .doc(`recruiterIntegrations/${companyId}_gmail`)
    .set({lastSyncAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true})

  return syncedMessages
}

async function syncOutlookMessages(admin: any, companyId: string, record: any, options: {since?: number; maxResults?: number} = {}) {
  const since = options.since || Date.now() - 7 * 24 * 60 * 60 * 1000
  const maxResults = Math.min(Math.max(options.maxResults || 100, 1), 500)
  const filter = `receivedDateTime ge ${new Date(since).toISOString()}`
  const top = Math.min(maxResults, 100)

  let url = `https://graph.microsoft.com/v1.0/me/messages?$top=${top}&$filter=${encodeURIComponent(filter)}&$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,importance,isRead,body,bodyPreview,flag,parentFolderId,internetMessageId,inReplyTo,references&$orderby=receivedDateTime desc`

  const response = await providerFetch(admin, record, {url})
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`graph_sync_${response.status}`)

  const messages = (payload.value || []).slice(0, maxResults)
  const syncedMessages = []

  for (const m of messages) {
    try {
      const fromEmail = m.from?.emailAddress?.address?.toLowerCase() || ''
      const fromName = m.from?.emailAddress?.name || ''
      const toEmails = m.toRecipients?.map((r: any) => r.emailAddress?.address?.toLowerCase()).filter(Boolean) || []
      const ccEmails = m.ccRecipients?.map((r: any) => r.emailAddress?.address?.toLowerCase()).filter(Boolean) || []
      const subject = m.subject || ''
      const messageId = m.internetMessageId || ''
      const inReplyTo = m.inReplyTo || ''
      const references = m.references || ''
      const conversationId = m.conversationId || ''

      const direction = fromEmail === record.providerEmail ? 'sent' : 'received'

      const baseMessageDoc = {
        companyId,
        providerId: 'outlook-email',
        providerAccountId: record.providerAccountId,
        providerMessageId: m.id,
        providerThreadId: conversationId,
        candidateId: '',
        applicationId: '',
        jobId: '',
        sender: {email: fromEmail, name: fromName},
        recipients: [...toEmails, ...ccEmails].map(e => ({email: e})),
        subject,
        textBody: m.body?.contentType === 'text' ? m.body.content.slice(0, 10000) : '',
        htmlBody: m.body?.contentType === 'html' ? m.body.content.slice(0, 20000) : '',
        sanitizedHtmlBody: m.body?.contentType === 'html' ? sanitizeHtml(m.body.content).slice(0, 20000) : '',
        isRead: m.isRead,
        direction,
        receivedAt: m.receivedDateTime,
        sentAt: direction === 'sent' && m.sentDateTime ? m.sentDateTime : null,
        syncedAt: new Date().toISOString(),
        flag: m.flag,
        parentFolderId: m.parentFolderId,
        inReplyTo,
        references,
        messageIdHeader: messageId,
      }

      const match = await matchMessageToCandidateAndApplication(admin, companyId, baseMessageDoc)
      const messageDoc = {...baseMessageDoc, ...match}

      const idempotencyKey = `outlook_${record.providerAccountId}_${m.id}`
      const messageRef = admin.firestore().collection('recruiterInboxMessages').doc(idempotencyKey)
      await messageRef.set(messageDoc, {merge: true})
      syncedMessages.push({id: m.id, conversationId, subject, from: fromEmail, direction})
    } catch (e) {
      console.error('Failed to sync Outlook message', m.id, e)
    }
  }

  await admin
    .firestore()
    .doc(`recruiterIntegrations/${companyId}_outlook-email`)
    .set({lastSyncAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true})

  return syncedMessages
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
    if (decoded.recruiter !== true && decoded.admin !== true) {
      throw new ApplicationError(403, 'Recruiter access is required.')
    }

    const companyId = cleanText(decoded.companyId || decoded.uid, 160)
    
    // Check permission for inbox sync
    assertIntegrationPermission(decoded, companyId, 'sync_inbox')

    const rateLimit = await checkRateLimit({
      admin,
      action: 'inbox-sync',
      identifier: `uid:${decoded.uid}`,
      limit: 10,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed)
      return json(
        429,
        origin,
        {error: 'Too many sync requests. Please try again later.'},
        {'Retry-After': String(rateLimit.retryAfterSeconds)},
      )

    const body = parseJsonBody(event)
    const providerId = cleanText(body.providerId, 40).toLowerCase()
    const since = body.since ? Number(body.since) : undefined
    const maxResults = body.maxResults ? Number(body.maxResults) : undefined

    if (providerId === 'gmail') {
      const record = await getEmailRecord(admin, companyId, 'gmail')
      const synced = await syncGmailMessages(admin, companyId, record, {since, maxResults})
      return json(200, origin, {synced: synced.length, messages: synced})
    }

    if (providerId === 'outlook-email') {
      const record = await getEmailRecord(admin, companyId, 'outlook-email')
      const synced = await syncOutlookMessages(admin, companyId, record, {since, maxResults})
      return json(200, origin, {synced: synced.length, messages: synced})
    }

    throw new ApplicationError(400, 'Unknown provider for sync.')
  } catch (error: any) {
    if (error instanceof ApplicationError)
      return json(error.statusCode, origin, {error: error.message})
    console.error('INBOX_SYNC_ERROR', safeProviderError(error))
    return json(500, origin, {error: 'The inbox sync could not be completed.'})
  }
}
