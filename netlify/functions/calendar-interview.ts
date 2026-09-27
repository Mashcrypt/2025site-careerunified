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

async function getCalendarRecord(admin: any, companyId: string, providerId: string) {
  const snap = await admin.firestore().doc(`recruiterIntegrations/${companyId}_${providerId}`).get()
  if (!snap.exists) throw new ApplicationError(404, `${providerId} not connected.`)
  const record = snap.data() || {}
  if (record.connectionStatus !== 'connected') {
    throw new ApplicationError(409, `${providerId} is not connected. Connect it in Integrations first.`)
  }
  return record
}

function generateIdempotencyKey(companyId: string, applicationId: string, interviewId: string, providerId: string, operation: string) {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(`${companyId}:${applicationId}:${interviewId}:${providerId}:${operation}`).digest('hex').slice(0, 32)
}

async function checkAndCreateIdempotencyRecord(admin: any, idempotencyKey: string, providerEventId: string, calendarId: string, providerId: string) {
  const idempotencyRef = admin.firestore().collection('calendarIdempotencyKeys').doc(idempotencyKey)
  
  return await admin.firestore().runTransaction(async (transaction: any) => {
    const doc = await transaction.get(idempotencyRef)
    
    if (doc.exists) {
      const data = doc.data() || {}
      if (data.status === 'completed' && data.providerEventId) {
        // Return existing event ID
        return {existing: true, providerEventId: data.providerEventId, calendarId: data.calendarId}
      }
      if (data.status === 'in_progress') {
        // Another request is in progress
        throw new Error('idempotency_in_progress')
      }
    }
    
    // Create new idempotency record
    transaction.set(idempotencyRef, {
      idempotencyKey,
      providerEventId: providerEventId || '',
      calendarId,
      providerId,
      status: providerEventId ? 'completed' : 'in_progress',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    
    return {existing: false}
  })
}

async function completeIdempotencyRecord(admin: any, idempotencyKey: string, providerEventId: string, calendarId: string) {
  const idempotencyRef = admin.firestore().collection('calendarIdempotencyKeys').doc(idempotencyKey)
  await admin.firestore().runTransaction(async (transaction: any) => {
    transaction.update(idempotencyRef, {
      providerEventId,
      calendarId,
      status: 'completed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  })
}

async function createGoogleCalendarEvent(admin: any, record: any, input: {
  calendarId: string
  summary: string
  description: string
  location: string
  start: string
  end: string
  timeZone: string
  attendees: Array<{email: string; displayName: string}>
  conferenceData: boolean
  applicationId: string
  interviewId: string
  idempotencyKey: string
}) {
  const eventBody: any = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: {dateTime: input.start, timeZone: input.timeZone},
    end: {dateTime: input.end, timeZone: input.timeZone},
    attendees: input.attendees.map(a => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: 'needsAction',
    })),
    reminders: {useDefault: true},
  }

  if (input.conferenceData) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: input.idempotencyKey,
        conferenceSolutionKey: {type: 'hangoutsMeet'},
      },
    }
  }

  let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`
  if (input.conferenceData) url += '?conferenceDataVersion=1'
  url += `&idempotencyKey=${encodeURIComponent(input.idempotencyKey)}`

  const response = await providerFetch(admin, record, {
    url,
    method: 'POST',
    body: eventBody,
  })
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`calendar_create_${response.status}`)

  return {
    eventId: payload.id,
    htmlLink: payload.htmlLink,
    hangoutLink: payload.hangoutLink || payload.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || '',
    start: payload.start,
    end: payload.end,
  }
}

async function updateGoogleCalendarEvent(admin: any, record: any, input: {
  calendarId: string
  eventId: string
  summary?: string
  description?: string
  location?: string
  start?: string
  end?: string
  timeZone?: string
  attendees?: Array<{email: string; displayName: string}>
  sendUpdates: string
}) {
  const eventBody: any = {}
  if (input.summary) eventBody.summary = input.summary
  if (input.description !== undefined) eventBody.description = input.description
  if (input.location !== undefined) eventBody.location = input.location
  if (input.start) eventBody.start = {dateTime: input.start, timeZone: input.timeZone}
  if (input.end) eventBody.end = {dateTime: input.end, timeZone: input.timeZone}
  if (input.attendees !== undefined) {
    eventBody.attendees = input.attendees.map(a => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: 'needsAction',
    }))
  }

  const response = await providerFetch(admin, record, {
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}?sendUpdates=${encodeURIComponent(input.sendUpdates)}`,
    method: 'PUT',
    body: eventBody,
  })
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`calendar_update_${response.status}`)

  return {
    eventId: payload.id,
    htmlLink: payload.htmlLink,
    start: payload.start,
    end: payload.end,
  }
}

async function deleteGoogleCalendarEvent(admin: any, record: any, input: {
  calendarId: string
  eventId: string
  sendUpdates: string
}) {
  const response = await providerFetch(admin, record, {
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}?sendUpdates=${encodeURIComponent(input.sendUpdates)}`,
    method: 'DELETE',
  })
  if (response.status !== 204 && response.status !== 200) {
    const payload: any = await response.json().catch(() => ({}))
    throw new Error(`calendar_delete_${response.status}`)
  }
  return {deleted: true}
}

async function createO365CalendarEvent(admin: any, record: any, input: {
  calendarId: string
  subject: string
  bodyContent: string
  location: string
  start: string
  end: string
  timeZone: string
  attendees: Array<{email: string; displayName: string}>
  isOnlineMeeting: boolean
  applicationId: string
  interviewId: string
  idempotencyKey: string
}) {
  const eventBody: any = {
    subject: input.subject,
    body: {contentType: 'HTML', content: input.bodyContent},
    location: input.location ? {displayName: input.location} : undefined,
    start: {dateTime: input.start, timeZone: input.timeZone},
    end: {dateTime: input.end, timeZone: input.timeZone},
    attendees: input.attendees.map(a => ({
      emailAddress: {address: a.email, name: a.displayName},
      type: 'required',
    })),
    isOnlineMeeting: input.isOnlineMeeting,
    onlineMeetingProvider: input.isOnlineMeeting ? 'teamsForBusiness' : undefined,
    allowNewTimeProposals: true,
  }

  if (input.idempotencyKey) {
    eventBody.idempotencyKey = input.idempotencyKey
  }

  const response = await providerFetch(admin, record, {
    url: `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(input.calendarId)}/events`,
    method: 'POST',
    body: eventBody,
  })
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`graph_create_event_${response.status}`)

  return {
    eventId: payload.id,
    webLink: payload.webLink,
    onlineMeeting: payload.onlineMeeting ? {joinUrl: payload.onlineMeeting.joinUrl} : null,
    start: payload.start,
    end: payload.end,
  }
}

async function updateO365CalendarEvent(admin: any, record: any, input: {
  calendarId: string
  eventId: string
  subject?: string
  bodyContent?: string
  location?: string
  start?: string
  end?: string
  timeZone?: string
  attendees?: Array<{email: string; displayName: string}>
  sendUpdates: string
}) {
  const eventBody: any = {}
  if (input.subject) eventBody.subject = input.subject
  if (input.bodyContent !== undefined) eventBody.body = {contentType: 'HTML', content: input.bodyContent}
  if (input.location !== undefined) eventBody.location = input.location ? {displayName: input.location} : undefined
  if (input.start) eventBody.start = {dateTime: input.start, timeZone: input.timeZone}
  if (input.end) eventBody.end = {dateTime: input.end, timeZone: input.timeZone}
  if (input.attendees !== undefined) {
    eventBody.attendees = input.attendees.map(a => ({
      emailAddress: {address: a.email, name: a.displayName},
      type: 'required',
    }))
  }

  const response = await providerFetch(admin, record, {
    url: `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    method: 'PATCH',
    body: eventBody,
  })
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`graph_update_event_${response.status}`)

  return {
    eventId: payload.id,
    webLink: payload.webLink,
    start: payload.start,
    end: payload.end,
  }
}

async function deleteO365CalendarEvent(admin: any, record: any, input: {
  calendarId: string
  eventId: string
}) {
  const response = await providerFetch(admin, record, {
    url: `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    method: 'DELETE',
  })
  if (response.status !== 204 && response.status !== 200) {
    const payload: any = await response.json().catch(() => ({}))
    throw new Error(`graph_delete_event_${response.status}`)
  }
  return {deleted: true}
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
    
    // Check permission for calendar interview operations
    assertIntegrationPermission(decoded, companyId, 'manage_calendars')

    const rateLimit = await checkRateLimit({
      admin,
      action: 'calendar-interview',
      identifier: `uid:${decoded.uid}`,
      limit: 30,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed)
      return json(
        429,
        origin,
        {error: 'Too many calendar requests. Please try again later.'},
        {'Retry-After': String(rateLimit.retryAfterSeconds)},
      )

    const body = parseJsonBody(event)
    const action = cleanText(body.action, 40).toLowerCase()
    const providerId = cleanText(body.providerId, 40).toLowerCase()
    const applicationId = cleanText(body.applicationId, 180)
    const interviewId = cleanText(body.interviewId, 180)

    if (!applicationId || !interviewId) {
      throw new ApplicationError(400, 'Application ID and Interview ID are required.')
    }

    const idempotencyKey = generateIdempotencyKey(companyId, applicationId, interviewId, providerId, action)

    if (providerId === 'google-calendar') {
      const record = await getCalendarRecord(admin, companyId, 'google-calendar')

      if (action === 'create-event') {
        // Check idempotency first
        const idempotencyCheck = await checkAndCreateIdempotencyRecord(admin, idempotencyKey, '', body.calendarId || 'primary', 'google-calendar')
        if (idempotencyCheck.existing) {
          return json(200, origin, {eventId: idempotencyCheck.providerEventId, htmlLink: '', hangoutLink: '', start: '', end: '', idempotent: true})
        }

        const result = await createGoogleCalendarEvent(admin, record, {
          calendarId: cleanText(body.calendarId || 'primary', 180),
          summary: cleanText(body.summary, 200),
          description: cleanText(body.description, 5000),
          location: cleanText(body.location, 500),
          start: cleanText(body.start, 80),
          end: cleanText(body.end, 80),
          timeZone: cleanText(body.timeZone || 'Africa/Johannesburg', 80),
          attendees: Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : [],
          conferenceData: body.conferenceData === true,
          applicationId,
          interviewId,
          idempotencyKey,
        })

        // Complete idempotency record
        await completeIdempotencyRecord(admin, idempotencyKey, result.eventId, body.calendarId || 'primary')

        await admin.firestore().doc(`applications/${applicationId}`).set({
          interviewSchedule: {
            providerEventId: result.eventId,
            providerCalendarId: body.calendarId || 'primary',
            providerId: 'google-calendar',
            hangoutLink: result.hangoutLink,
            htmlLink: result.htmlLink,
          },
        }, {merge: true})

        return json(200, origin, result)
      }

      if (action === 'update-event') {
        const eventId = cleanText(body.eventId, 180)
        if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

        const result = await updateGoogleCalendarEvent(admin, record, {
          calendarId: cleanText(body.calendarId || 'primary', 180),
          eventId,
          summary: body.summary ? cleanText(body.summary, 200) : undefined,
          description: body.description ? cleanText(body.description, 5000) : undefined,
          location: body.location ? cleanText(body.location, 500) : undefined,
          start: body.start ? cleanText(body.start, 80) : undefined,
          end: body.end ? cleanText(body.end, 80) : undefined,
          timeZone: cleanText(body.timeZone || 'Africa/Johannesburg', 80),
          attendees: Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : undefined,
          sendUpdates: cleanText(body.sendUpdates || 'all', 20),
        })

        return json(200, origin, result)
      }

      if (action === 'delete-event') {
        const eventId = cleanText(body.eventId, 180)
        if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

        const result = await deleteGoogleCalendarEvent(admin, record, {
          calendarId: cleanText(body.calendarId || 'primary', 180),
          eventId,
          sendUpdates: cleanText(body.sendUpdates || 'all', 20),
        })

        await admin.firestore().doc(`applications/${applicationId}`).set({
          interviewSchedule: {
            providerEventId: null,
            providerCalendarId: null,
            providerId: null,
            hangoutLink: null,
            htmlLink: null,
          },
        }, {merge: true})

        return json(200, origin, result)
      }
    }

    if (providerId === 'office-365-calendar') {
      const record = await getCalendarRecord(admin, companyId, 'office-365-calendar')

      if (action === 'create-event') {
        // Check idempotency first
        const idempotencyCheck = await checkAndCreateIdempotencyRecord(admin, idempotencyKey, '', body.calendarId || 'primary', 'office-365-calendar')
        if (idempotencyCheck.existing) {
          return json(200, origin, {eventId: idempotencyCheck.providerEventId, webLink: '', onlineMeeting: null, start: '', end: '', idempotent: true})
        }

        const result = await createO365CalendarEvent(admin, record, {
          calendarId: cleanText(body.calendarId || 'primary', 180),
          subject: cleanText(body.subject, 200),
          bodyContent: cleanText(body.description, 5000),
          location: cleanText(body.location, 500),
          start: cleanText(body.start, 80),
          end: cleanText(body.end, 80),
          timeZone: cleanText(body.timeZone || 'Africa/Johannesburg', 80),
          attendees: Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : [],
          isOnlineMeeting: body.isOnlineMeeting === true,
          applicationId,
          interviewId,
          idempotencyKey,
        })

        // Complete idempotency record
        await completeIdempotencyRecord(admin, idempotencyKey, result.eventId, body.calendarId || 'primary')

        await admin.firestore().doc(`applications/${applicationId}`).set({
          interviewSchedule: {
            providerEventId: result.eventId,
            providerCalendarId: body.calendarId || 'primary',
            providerId: 'office-365-calendar',
            onlineMeetingJoinUrl: result.onlineMeeting?.joinUrl,
            webLink: result.webLink,
          },
        }, {merge: true})

        return json(200, origin, result)
      }

      if (action === 'update-event') {
        const eventId = cleanText(body.eventId, 180)
        if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

        const result = await updateO365CalendarEvent(admin, record, {
          calendarId: cleanText(body.calendarId || 'primary', 180),
          eventId,
          subject: body.summary ? cleanText(body.summary, 200) : undefined,
          bodyContent: body.description ? cleanText(body.description, 5000) : undefined,
          location: body.location ? cleanText(body.location, 500) : undefined,
          start: body.start ? cleanText(body.start, 80) : undefined,
          end: body.end ? cleanText(body.end, 80) : undefined,
          timeZone: cleanText(body.timeZone || 'Africa/Johannesburg', 80),
          attendees: Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : undefined,
          sendUpdates: cleanText(body.sendUpdates || 'all', 20),
        })

        return json(200, origin, result)
      }

      if (action === 'delete-event') {
        const eventId = cleanText(body.eventId, 180)
        if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

        const result = await deleteO365CalendarEvent(admin, record, {
          calendarId: cleanText(body.calendarId || 'primary', 180),
          eventId,
        })

        await admin.firestore().doc(`applications/${applicationId}`).set({
          interviewSchedule: {
            providerEventId: null,
            providerCalendarId: null,
            providerId: null,
            onlineMeetingJoinUrl: null,
            webLink: null,
          },
        }, {merge: true})

        return json(200, origin, result)
      }
    }

    throw new ApplicationError(400, 'Unknown calendar provider or action.')
  } catch (error: any) {
    if (error instanceof ApplicationError)
      return json(error.statusCode, origin, {error: error.message})
    console.error('CALENDAR_INTERVIEW_ERROR', safeProviderError(error))
    return json(500, origin, {error: 'The calendar interview operation could not be completed.'})
  }
}
