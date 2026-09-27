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

async function getCalendarRecord(admin: any, companyId: string) {
  const snap = await admin.firestore().doc(`recruiterIntegrations/${companyId}_google-calendar`).get()
  if (!snap.exists) throw new ApplicationError(404, 'Google Calendar not connected.')
  const record = snap.data() || {}
  if (record.connectionStatus !== 'connected') {
    throw new ApplicationError(409, 'Google Calendar is not connected. Connect it in Integrations first.')
  }
  return record
}

function generateIdempotencyKey(companyId: string, applicationId: string, interviewId: string, providerId: string, operation: string) {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(`${companyId}:${applicationId}:${interviewId}:${providerId}:${operation}`).digest('hex').slice(0, 32)
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
    
    // Check read permission for status/list actions, manage permission for others
    const body = parseJsonBody(event)
    const action = cleanText(body.action, 40).toLowerCase()
    
    if (action === 'status' || action === 'list-calendars' || action === 'freebusy' || action === 'list-events' || action === 'get-event') {
      assertIntegrationPermission(decoded, companyId, 'read_calendars')
    } else {
      assertIntegrationPermission(decoded, companyId, 'manage_calendars')
    }
    
    const record = await getCalendarRecord(admin, companyId)

    const rateLimit = await checkRateLimit({
      admin,
      action: 'google-calendar-operations',
      identifier: `uid:${decoded.uid}`,
      limit: 60,
      windowSeconds: 60,
    })
    if (!rateLimit.allowed)
      return json(
        429,
        origin,
        {error: 'Too many Calendar requests. Please try again later.'},
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

    if (action === 'list-calendars') {
      const response = await providerFetch(admin, record, {
        url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`calendar_list_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        calendars: (payload.items || []).map((c: any) => ({
          id: c.id,
          summary: c.summary,
          description: c.description,
          primary: c.primary || false,
          accessRole: c.accessRole,
          backgroundColor: c.backgroundColor,
          foregroundColor: c.foregroundColor,
        })),
      })
    }

    if (action === 'freebusy') {
      const timeMin = cleanText(body.timeMin, 80)
      const timeMax = cleanText(body.timeMax, 80)
      const calendarIds = Array.isArray(body.calendarIds) ? body.calendarIds.slice(0, 20) : ['primary']

      if (!timeMin || !timeMax) {
        throw new ApplicationError(400, 'timeMin and timeMax are required for freebusy query.')
      }

      const response = await providerFetch(admin, record, {
        url: 'https://www.googleapis.com/calendar/v3/freeBusy',
        method: 'POST',
        body: {
          timeMin,
          timeMax,
          items: calendarIds.map((id: string) => ({id})),
        },
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`calendar_freebusy_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        calendars: payload.calendars || {},
      })
    }

    if (action === 'create-event') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const summary = cleanText(body.summary, 200)
      const description = cleanText(body.description, 5000)
      const location = cleanText(body.location, 500)
      const start = cleanText(body.start, 80)
      const end = cleanText(body.end, 80)
      const timeZone = cleanText(body.timeZone || 'Africa/Johannesburg', 80)
      const attendees = Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : []
      const conferenceData = body.conferenceData === true
      const applicationId = cleanText(body.applicationId || '', 180)
      const interviewId = cleanText(body.interviewId || '', 180)
      const idempotencyKey = body.idempotencyKey || (applicationId ? generateIdempotencyKey(companyId, applicationId, interviewId || '', 'google-calendar', 'create-event') : '')

      if (!summary || !start || !end) {
        throw new ApplicationError(400, 'Summary, start, and end are required for event creation.')
      }

      const eventBody: any = {
        summary,
        description: description || '',
        location: location || '',
        start: {dateTime: start, timeZone},
        end: {dateTime: end, timeZone},
        attendees: attendees.map((a: any) => ({
          email: cleanText(a.email, 254),
          displayName: cleanText(a.displayName || '', 160),
          responseStatus: 'needsAction',
        })),
        reminders: {useDefault: true},
      }

      if (conferenceData) {
        eventBody.conferenceData = {createRequest: {requestId: idempotencyKey || generateIdempotencyKey(companyId, 'conf', '', 'google-calendar', 'conf'), conferenceSolutionKey: {type: 'hangoutsMeet'}}}
      }

      let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
      if (conferenceData) url += '?conferenceDataVersion=1'
      if (idempotencyKey) url += `${conferenceData ? '&' : '?'}idempotencyKey=${encodeURIComponent(idempotencyKey)}`

      const response = await providerFetch(admin, record, {
        url,
        method: 'POST',
        body: eventBody,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`calendar_create_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        eventId: payload.id,
        htmlLink: payload.htmlLink,
        hangoutLink: payload.hangoutLink || payload.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || '',
        start: payload.start,
        end: payload.end,
      })
    }

    if (action === 'update-event') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const eventId = cleanText(body.eventId, 180)
      const summary = cleanText(body.summary, 200)
      const description = cleanText(body.description, 5000)
      const location = cleanText(body.location, 500)
      const start = cleanText(body.start, 80)
      const end = cleanText(body.end, 80)
      const timeZone = cleanText(body.timeZone || 'Africa/Johannesburg', 80)
      const attendees = Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : undefined
      const sendUpdates = cleanText(body.sendUpdates || 'all', 20)

      if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

      const eventBody: any = {}
      if (summary) eventBody.summary = summary
      if (description !== undefined) eventBody.description = description
      if (location !== undefined) eventBody.location = location
      if (start) eventBody.start = {dateTime: start, timeZone}
      if (end) eventBody.end = {dateTime: end, timeZone}
      if (attendees !== undefined) {
        eventBody.attendees = attendees.map((a: any) => ({
          email: cleanText(a.email, 254),
          displayName: cleanText(a.displayName || '', 160),
          responseStatus: 'needsAction',
        }))
      }

      const response = await providerFetch(admin, record, {
        url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`,
        method: 'PUT',
        body: eventBody,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`calendar_update_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        eventId: payload.id,
        htmlLink: payload.htmlLink,
        start: payload.start,
        end: payload.end,
      })
    }

    if (action === 'delete-event') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const eventId = cleanText(body.eventId, 180)
      const sendUpdates = cleanText(body.sendUpdates || 'all', 20)

      if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

      const response = await providerFetch(admin, record, {
        url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`,
        method: 'DELETE',
      })
      if (response.status !== 204 && response.status !== 200) {
        const payload: any = await response.json().catch(() => ({}))
        throw new Error(`calendar_delete_${response.status}_${safeProviderError(payload.error)}`)
      }

      return json(200, origin, {eventId, deleted: true})
    }

    if (action === 'get-event') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const eventId = cleanText(body.eventId, 180)

      if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

      const response = await providerFetch(admin, record, {
        url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`calendar_get_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        id: payload.id,
        summary: payload.summary,
        description: payload.description,
        location: payload.location,
        start: payload.start,
        end: payload.end,
        attendees: payload.attendees || [],
        hangoutLink: payload.hangoutLink || '',
        htmlLink: payload.htmlLink,
        status: payload.status,
        created: payload.created,
        updated: payload.updated,
      })
    }

    if (action === 'list-events') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const timeMin = cleanText(body.timeMin, 80)
      const timeMax = cleanText(body.timeMax, 80)
      const maxResults = Math.min(Math.max(Number(body.maxResults) || 50, 1), 250)
      const q = cleanText(body.q || '', 500)
      const pageToken = cleanText(body.pageToken || '', 200)

      let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=${maxResults}&singleEvents=true&orderBy=startTime`
      if (timeMin) url += `&timeMin=${encodeURIComponent(timeMin)}`
      if (timeMax) url += `&timeMax=${encodeURIComponent(timeMax)}`
      if (q) url += `&q=${encodeURIComponent(q)}`
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`

      const response = await providerFetch(admin, record, {url})
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`calendar_list_events_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        events: (payload.items || []).map((e: any) => ({
          id: e.id,
          summary: e.summary,
          description: e.description,
          location: e.location,
          start: e.start,
          end: e.end,
          attendees: e.attendees || [],
          hangoutLink: e.hangoutLink || '',
          htmlLink: e.htmlLink,
          status: e.status,
        })),
        nextPageToken: payload.nextPageToken || null,
      })
    }

    throw new ApplicationError(400, 'Unknown Google Calendar action.')
  } catch (error: any) {
    if (error instanceof ApplicationError)
      return json(error.statusCode, origin, {error: error.message})
    console.error('GOOGLE_CALENDAR_OPERATIONS_ERROR', safeProviderError(error))
    return json(500, origin, {error: 'The Google Calendar operation could not be completed.'})
  }
}
