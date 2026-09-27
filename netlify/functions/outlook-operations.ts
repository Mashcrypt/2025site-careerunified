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
    const {refreshAccessToken} = await import('./_connectedEmail.js')
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

async function getOutlookRecord(admin: any, companyId: string) {
  const snap = await admin.firestore().doc(`recruiterIntegrations/${companyId}_outlook-email`).get()
  if (!snap.exists) throw new ApplicationError(404, 'Outlook not connected.')
  const record = snap.data() || {}
  if (record.connectionStatus !== 'connected') {
    throw new ApplicationError(409, 'Outlook is not connected. Connect it in Integrations first.')
  }
  return record
}

function sanitizeHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
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

    const companyId = cleanText(decoded.companyId || decoded.uid, 160)
    const body = parseJsonBody(event)
    const action = cleanText(body.action, 40).toLowerCase()
    
    // Check read permission for status action, manage permission for others
    if (action === 'status') {
      assertIntegrationPermission(decoded, companyId, 'read_email')
    } else {
      assertIntegrationPermission(decoded, companyId, 'send_email')
    }
    
    const record = await getOutlookRecord(admin, companyId)

    const rateLimit = await checkRateLimit({
      admin,
      action: 'outlook-operations',
      identifier: `uid:${decoded.uid}`,
      limit: 60,
      windowSeconds: 60,
    })
    if (!rateLimit.allowed)
      return json(
        429,
        origin,
        {error: 'Too many Outlook requests. Please try again later.'},
        {'Retry-After': String(rateLimit.retryAfterSeconds)},
      )

    if (action === 'status') {
      return json(200, origin, {
        providerEmail: record.providerEmail,
        providerAccountId: record.providerAccountId,
        grantedScopes: record.grantedScopes || [],
        lastSyncAt: record.lastSyncAt?.toDate?.()?.toISOString?.() || record.lastSyncAt || '',
        connectionStatus: record.connectionStatus,
      })
    }

    if (action === 'send') {
      const to = cleanText(body.to, 254)
      const subject = cleanText(body.subject, 180)
      const text = cleanText(body.text, 5000)
      const html = cleanText(body.html, 10000)
      const replyTo = cleanText(body.replyTo || '', 254)
      const conversationId = cleanText(body.conversationId || '', 180)
      const inReplyTo = cleanText(body.inReplyTo || '', 180)

      if (!to || !subject || (!text && !html)) {
        throw new ApplicationError(400, 'Recipient, subject, and message body are required.')
      }

      const messageBody = {
        subject,
        body: {contentType: 'HTML', content: sanitizeHtml(html || text || '')},
        toRecipients: [{emailAddress: {address: to}}],
        replyTo: replyTo ? [{emailAddress: {address: replyTo}}] : [],
      }

      let response: Response
      if (conversationId) {
        const createResponse = await providerFetch(admin, record, {
          url: 'https://graph.microsoft.com/v1.0/me/messages',
          method: 'POST',
          body: {...messageBody, conversationId},
        })
        const draft: any = await createResponse.json().catch(() => ({}))
        if (!createResponse.ok || !draft.id)
          throw new Error(`graph_draft_${createResponse.status}`)
        response = await providerFetch(admin, record, {
          url: `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}/send`,
          method: 'POST',
        })
      } else {
        response = await providerFetch(admin, record, {
          url: 'https://graph.microsoft.com/v1.0/me/sendMail',
          method: 'POST',
          body: {message: messageBody, saveToSentItems: true},
        })
      }

      if (!response.ok) {
        const payload: any = await response.json().catch(() => ({}))
        throw new Error(`graph_send_${response.status}_${safeProviderError(payload.error)}`)
      }

      return json(200, origin, {
        providerMessageId: '',
        providerThreadId: conversationId || '',
      })
    }

    if (action === 'list') {
      const top = Math.min(Math.max(Number(body.top) || 50, 1), 100)
      const skip = Math.max(Number(body.skip) || 0, 0)
      const filter = cleanText(body.filter || '', 500)
      const select = 'id,conversationId,subject,from,toRecipients,receivedDateTime,hasAttachments,importance,isRead,bodyPreview,flag,parentFolderId'

      let url = `https://graph.microsoft.com/v1.0/me/messages?$top=${top}&$skip=${skip}&$select=${select}&$orderby=receivedDateTime desc`
      if (filter) url += `&$filter=${encodeURIComponent(filter)}`

      const response = await providerFetch(admin, record, {url})
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`graph_list_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        messages: (payload.value || []).map((m: any) => ({
          id: m.id,
          conversationId: m.conversationId,
          subject: m.subject,
          from: m.from?.emailAddress?.address,
          toRecipients: m.toRecipients?.map((r: any) => r.emailAddress?.address) || [],
          receivedDateTime: m.receivedDateTime,
          hasAttachments: m.hasAttachments,
          importance: m.importance,
          isRead: m.isRead,
          bodyPreview: m.bodyPreview,
          flag: m.flag,
          parentFolderId: m.parentFolderId,
        })),
        nextLink: payload['@odata.nextLink'] || null,
      })
    }

    if (action === 'get') {
      const messageId = cleanText(body.messageId, 180)
      if (!messageId) throw new ApplicationError(400, 'Message ID is required.')

      const response = await providerFetch(admin, record, {
        url: `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,hasAttachments,importance,isRead,body,bodyPreview,flag,parentFolderId,internetMessageId,inReplyTo,references`,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`graph_get_${response.status}_${safeProviderError(payload.error)}`)

      const attachments: any[] = []
      if (payload.hasAttachments) {
        const attResp = await providerFetch(admin, record, {
          url: `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/attachments`,
        })
        const attData: any = await attResp.json().catch(() => ({}))
        if (attResp.ok && attData.value) {
          attData.value.forEach((a: any) => {
            attachments.push({
              id: a.id,
              name: a.name,
              contentType: a.contentType,
              size: a.size,
              isInline: a.isInline,
            })
          })
        }
      }

      return json(200, origin, {
        id: payload.id,
        conversationId: payload.conversationId,
        subject: payload.subject,
        from: payload.from?.emailAddress?.address,
        toRecipients: payload.toRecipients?.map((r: any) => r.emailAddress?.address) || [],
        ccRecipients: payload.ccRecipients?.map((r: any) => r.emailAddress?.address) || [],
        bccRecipients: payload.bccRecipients?.map((r: any) => r.emailAddress?.address) || [],
        receivedDateTime: payload.receivedDateTime,
        sentDateTime: payload.sentDateTime,
        hasAttachments: payload.hasAttachments,
        importance: payload.importance,
        isRead: payload.isRead,
        bodyPreview: payload.bodyPreview,
        body: payload.body ? {contentType: payload.body.contentType, content: sanitizeHtml(payload.body.content)} : null,
        flag: payload.flag,
        parentFolderId: payload.parentFolderId,
        internetMessageId: payload.internetMessageId,
        inReplyTo: payload.inReplyTo,
        references: payload.references,
        attachments,
      })
    }

    if (action === 'reply') {
      const messageId = cleanText(body.messageId, 180)
      const text = cleanText(body.text, 5000)
      const html = cleanText(body.html, 10000)
      const replyToAll = body.replyToAll === true

      if (!messageId) throw new ApplicationError(400, 'Message ID is required.')
      if (!text && !html) throw new ApplicationError(400, 'Reply body is required.')

      const response = await providerFetch(admin, record, {
        url: `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/${replyToAll ? 'replyAll' : 'reply'}`,
        method: 'POST',
        body: {
          comment: sanitizeHtml(html || text || ''),
        },
      })

      if (!response.ok) {
        const payload: any = await response.json().catch(() => ({}))
        throw new Error(`graph_reply_${response.status}_${safeProviderError(payload.error)}`)
      }

      return json(200, origin, {messageId, replied: true})
    }

    if (action === 'modify') {
      const messageId = cleanText(body.messageId, 180)
      const isRead = typeof body.isRead === 'boolean' ? body.isRead : undefined
      const categories = Array.isArray(body.categories) ? body.categories.slice(0, 10) : undefined
      const flag = body.flag ? {flagStatus: body.flag.flagStatus || 'flagged'} : undefined

      if (!messageId) throw new ApplicationError(400, 'Message ID is required.')

      const updateBody: any = {}
      if (isRead !== undefined) updateBody.isRead = isRead
      if (categories !== undefined) updateBody.categories = categories
      if (flag !== undefined) updateBody.flag = flag

      const response = await providerFetch(admin, record, {
        url: `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`,
        method: 'PATCH',
        body: updateBody,
      })
      if (!response.ok) {
        const payload: any = await response.json().catch(() => ({}))
        throw new Error(`graph_modify_${response.status}_${safeProviderError(payload.error)}`)
      }

      return json(200, origin, {id: messageId, updated: true})
    }

    if (action === 'draft') {
      const to = cleanText(body.to, 254)
      const subject = cleanText(body.subject, 180)
      const text = cleanText(body.text, 5000)
      const html = cleanText(body.html, 10000)
      const replyTo = cleanText(body.replyTo || '', 254)
      const draftId = cleanText(body.draftId || '', 180)

      if (!to || !subject || (!text && !html)) {
        throw new ApplicationError(400, 'Recipient, subject, and message body are required.')
      }

      const messageBody = {
        subject,
        body: {contentType: 'HTML', content: sanitizeHtml(html || text || '')},
        toRecipients: [{emailAddress: {address: to}}],
        replyTo: replyTo ? [{emailAddress: {address: replyTo}}] : [],
      }

      let response: Response
      if (draftId) {
        response = await providerFetch(admin, record, {
          url: `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}`,
          method: 'PATCH',
          body: messageBody,
        })
      } else {
        response = await providerFetch(admin, record, {
          url: 'https://graph.microsoft.com/v1.0/me/messages',
          method: 'POST',
          body: messageBody,
        })
      }

      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok || !payload.id)
        throw new Error(`graph_draft_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {draftId: payload.id, messageId: payload.id})
    }

    if (action === 'sync') {
      const since = body.since ? new Date(cleanText(body.since, 80)).getTime() : Date.now() - 7 * 24 * 60 * 60 * 1000
      const filter = `receivedDateTime ge ${new Date(since).toISOString()}`
      const top = Math.min(Math.max(Number(body.top) || 100, 1), 500)

      let url = `https://graph.microsoft.com/v1.0/me/messages?$top=${top}&$filter=${encodeURIComponent(filter)}&$select=id,conversationId,subject,from,toRecipients,receivedDateTime,hasAttachments,importance,isRead,bodyPreview,flag,parentFolderId&$orderby=receivedDateTime desc`

      const response = await providerFetch(admin, record, {url})
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`graph_sync_${response.status}_${safeProviderError(payload.error)}`)

      const messages = (payload.value || []).slice(0, top).map((m: any) => ({
        id: m.id,
        conversationId: m.conversationId,
        subject: m.subject,
        from: m.from?.emailAddress?.address,
        toRecipients: m.toRecipients?.map((r: any) => r.emailAddress?.address) || [],
        receivedDateTime: m.receivedDateTime,
        hasAttachments: m.hasAttachments,
        importance: m.importance,
        isRead: m.isRead,
        bodyPreview: m.bodyPreview,
        flag: m.flag,
        parentFolderId: m.parentFolderId,
      }))

      await admin
        .firestore()
        .doc(`recruiterIntegrations/${companyId}_outlook-email`)
        .set({lastSyncAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true})

      return json(200, origin, {
        messages,
        syncedAt: new Date().toISOString(),
      })
    }

    throw new ApplicationError(400, 'Unknown Outlook action.')
  } catch (error: any) {
    if (error instanceof ApplicationError)
      return json(error.statusCode, origin, {error: error.message})
    console.error('OUTLOOK_OPERATIONS_ERROR', safeProviderError(error))
    return json(500, origin, {error: 'The Outlook operation could not be completed.'})
  }
}
