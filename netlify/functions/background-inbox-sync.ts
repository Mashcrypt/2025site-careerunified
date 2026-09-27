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
import {extractEmailAddress, extractName, matchMessageToCandidateAndApplication, sanitizeHtml} from './inbox-sync'

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

async function syncGmailWithCursor(admin: any, companyId: string, record: any) {
  const historyId = record.gmailHistoryId || null
  const maxResults = 100

  let url = `https://gmail.googleapis.com/gmail/v1/users/me/history?maxResults=${maxResults}`
  if (historyId) {
    url += `&startHistoryId=${historyId}`
  } else {
    // Fallback to recent messages if no history ID
    const since = Date.now() - 24 * 60 * 60 * 1000
    url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=after:${Math.floor(since / 1000)}`
  }

  const response = await providerFetch(admin, record, {url})
  const payload: any = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 404 && historyId) {
      // History ID expired, fall back to recent messages
      const since = Date.now() - 24 * 60 * 60 * 1000
      const fallbackUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=after:${Math.floor(since / 1000)}`
      const fallbackResponse = await providerFetch(admin, record, {url: fallbackUrl})
      const fallbackPayload: any = await fallbackResponse.json().catch(() => ({}))
      if (!fallbackResponse.ok) throw new Error(`gmail_sync_fallback_${fallbackResponse.status}`)
      return {messages: fallbackPayload.messages || [], newHistoryId: fallbackPayload.historyId || null}
    }
    throw new Error(`gmail_history_${response.status}`)
  }

  const messages = []
  if (payload.history) {
    for (const h of payload.history) {
      if (h.messagesAdded) {
        for (const m of h.messagesAdded) {
          messages.push(m.message)
        }
      }
    }
  } else if (payload.messages) {
    messages.push(...payload.messages)
  }

  return {messages: messages.slice(0, 100), newHistoryId: payload.historyId || historyId}
}

async function syncOutlookWithDelta(admin: any, companyId: string, record: any) {
  const deltaLink = record.outlookDeltaLink || null
  const maxResults = 100

  let url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$top=100&$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,importance,isRead,body,bodyPreview,flag,parentFolderId,internetMessageId,inReplyTo,references`
  if (deltaLink) {
    url = deltaLink
  }

  const response = await providerFetch(admin, record, {url})
  const payload: any = await response.json().catch(() => ({}))

  if (!response.ok) throw new Error(`graph_delta_${response.status}`)

  const messages = payload.value || []
  const newDeltaLink = payload['@odata.deltaLink'] || payload['@odata.nextLink'] || deltaLink

  return {messages, newDeltaLink}
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
    
    // Check permission for background inbox sync
    assertIntegrationPermission(decoded, companyId, 'sync_inbox')

    const rateLimit = await checkRateLimit({
      admin,
      action: 'background-inbox-sync',
      identifier: `uid:${decoded.uid}`,
      limit: 5,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed)
      return json(
        429,
        origin,
        {error: 'Too many background sync requests. Please try again later.'},
        {'Retry-After': String(rateLimit.retryAfterSeconds)},
      )

    const body = parseJsonBody(event)
    const providerId = cleanText(body.providerId || '', 40).toLowerCase()

    if (providerId === 'gmail') {
      const record = await getEmailRecord(admin, companyId, 'gmail')
      const {messages, newHistoryId} = await syncGmailWithCursor(admin, companyId, record)

      if (messages.length > 0) {
        // Process messages similar to syncGmailMessages but with history
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

            const fromEmail = extractEmailAddress(headers.from || '')
            const fromName = extractName(headers.from || '')
            const toEmails = (headers.to || '').split(',').map(extractEmailAddress).filter(Boolean)

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
              subject: headers.subject || '',
              textBody: '',
              htmlBody: '',
              sanitizedHtmlBody: '',
              isRead: !data.labelIds?.includes('UNREAD'),
              direction,
              receivedAt: data.internalDate ? new Date(Number(data.internalDate)).toISOString() : new Date().toISOString(),
              sentAt: direction === 'sent' && data.internalDate ? new Date(Number(data.internalDate)).toISOString() : null,
              syncedAt: new Date().toISOString(),
              labels: data.labelIds || [],
              inReplyTo: headers['in-reply-to'] || '',
              references: headers.references || '',
              messageIdHeader: headers['message-id'] || '',
            }

            const match = await matchMessageToCandidateAndApplication(admin, companyId, baseMessageDoc)
            const messageDoc = {...baseMessageDoc, ...match}

            const idempotencyKey = `gmail_${record.providerAccountId}_${data.id}`
            const messageRef = admin.firestore().collection('recruiterInboxMessages').doc(idempotencyKey)
            await messageRef.set(messageDoc, {merge: true})
          } catch (e) {
            console.error('Failed to sync Gmail message (background)', m.id, e)
          }
        }
      }

      await admin
        .firestore()
        .doc(`recruiterIntegrations/${companyId}_gmail`)
        .set({
          lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
          gmailHistoryId: newHistoryId,
        }, {merge: true})

      return json(200, origin, {synced: messages.length, newHistoryId})
    }

    if (providerId === 'outlook-email') {
      const record = await getEmailRecord(admin, companyId, 'outlook-email')
      const {messages, newDeltaLink} = await syncOutlookWithDelta(admin, companyId, record)

      if (messages.length > 0) {
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
          } catch (e) {
            console.error('Failed to sync Outlook message (background)', m.id, e)
          }
        }
      }

      await admin
        .firestore()
        .doc(`recruiterIntegrations/${companyId}_outlook-email`)
        .set({
          lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
          outlookDeltaLink: newDeltaLink,
        }, {merge: true})

      return json(200, origin, {synced: messages.length, newDeltaLink})
    }

    throw new ApplicationError(400, 'Unknown provider for background sync.')
  } catch (error: any) {
    if (error instanceof ApplicationError)
      return json(error.statusCode, origin, {error: error.message})
    console.error('BACKGROUND_INBOX_SYNC_ERROR', safeProviderError(error))
    return json(500, origin, {error: 'The background inbox sync could not be completed.'})
  }
}
