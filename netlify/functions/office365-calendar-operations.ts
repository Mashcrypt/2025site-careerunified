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

async function getO365CalendarRecord(admin: any, companyId: string) {
  const snap = await admin.firestore().doc(`recruiterIntegrations/${companyId}_office-365-calendar`).get()
  if (!snap.exists) throw new ApplicationError(404, 'Office 365 Calendar not connected.')
  const record = snap.data() || {}
  if (record.connectionStatus !== 'connected') {
    throw new ApplicationError(409, 'Office 365 Calendar is not connected. Connect it in Integrations first.')
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
    
    const record = await getO365CalendarRecord(admin, companyId)

    const rateLimit = await checkRateLimit({
      admin,
      action: 'o365-calendar-operations',
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
        url: 'https://graph.microsoft.com/v1.0/me/calendars',
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`graph_calendars_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        calendars: (payload.value || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          isDefault: c.isDefaultCalendar || false,
          canEdit: c.canEdit,
          canShare: c.canShare,
          owner: c.owner?.emailAddress?.address,
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

      const schedules = calendarIds.map((id: string) => ({id}))
      const response = await providerFetch(admin, record, {
        url: 'https://graph.microsoft.com/v1.0/me/calendar/getSchedule',
        method: 'POST',
        body: {
          schedules,
          startTime: {dateTime: timeMin, timeZone: 'Africa/Johannesburg'},
          endTime: {dateTime: timeMax, timeZone: 'Africa/Johannesburg'},
          availabilityViewInterval: 30,
        },
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`graph_freebusy_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        schedules: payload.value || [],
      })
    }

    if (action === 'create-event') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const subject = cleanText(body.subject, 200)
      const bodyContent = cleanText(body.body || body.description, 5000)
      const location = cleanText(body.location, 500)
      const start = cleanText(body.start, 80)
      const end = cleanText(body.end, 80)
      const timeZone = cleanText(body.timeZone || 'Africa/Johannesburg', 80)
      const attendees = Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : []
      const isOnlineMeeting = body.isOnlineMeeting === true
      const applicationId = cleanText(body.applicationId || '', 180)
      const interviewId = cleanText(body.interviewId || '', 180)
      const idempotencyKey = body.idempotencyKey || (applicationId ? generateIdempotencyKey(companyId, applicationId, interviewId || '', 'office-365-calendar', 'create-event') : '')

      if (!subject || !start || !end) {
        throw new ApplicationError(400, 'Subject, start, and end are required for event creation.')
      }

      const eventBody: any = {
        subject,
        body: {contentType: 'HTML', content: bodyContent || ''},
        location: location ? {displayName: location} : undefined,
        start: {dateTime: start, timeZone},
        end: {dateTime: end, timeZone},
        attendees: attendees.map((a: any) => ({
          emailAddress: {address: cleanText(a.email, 254), name: cleanText(a.displayName || '', 160)},
          type: 'required',
        })),
        isOnlineMeeting,
        onlineMeetingProvider: isOnlineMeeting ? 'teamsForBusiness' : undefined,
        allowNewTimeProposals: true,
      }

      let url = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`
      if (idempotencyKey) {
        eventBody.idempotencyKey = idempotencyKey
      }

      const response = await providerFetch(admin, record, {
        url,
        method: 'POST',
        body: eventBody,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`graph_create_event_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        eventId: payload.id,
        webLink: payload.webLink,
        onlineMeeting: payload.onlineMeeting ? {joinUrl: payload.onlineMeeting.joinUrl} : null,
        start: payload.start,
        end: payload.end,
      })
    }

    if (action === 'update-event') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const eventId = cleanText(body.eventId, 180)
      const subject = cleanText(body.subject, 200)
      const bodyContent = cleanText(body.body || body.description, 5000)
      const location = cleanText(body.location, 500)
      const start = cleanText(body.start, 80)
      const end = cleanText(body.end, 80)
      const timeZone = cleanText(body.timeZone || 'Africa/Johannesburg', 80)
      const attendees = Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : undefined
      const sendUpdates = cleanText(body.sendUpdates || 'all', 20)

      if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

      const eventBody: any = {}
      if (subject) eventBody.subject = subject
      if (bodyContent !== undefined) eventBody.body = {contentType: 'HTML', content: bodyContent}
      if (location !== undefined) eventBody.location = location ? {displayName: location} : undefined
      if (start) eventBody.start = {dateTime: start, timeZone}
      if (end) eventBody.end = {dateTime: end, timeZone}
      if (attendees !== undefined) {
        eventBody.attendees = attendees.map((a: any) => ({
          emailAddress: {address: cleanText(a.email, 254), name: cleanText(a.displayName || '', 160)},
          type: 'required',
        }))
      }

      const response = await providerFetch(admin, record, {
        url: `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        method: 'PATCH',
        body: eventBody,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`graph_update_event_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        eventId: payload.id,
        webLink: payload.webLink,
        start: payload.start,
        end: payload.end,
      })
    }

    if (action === 'delete-event') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const eventId = cleanText(body.eventId, 180)

      if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

      const response = await providerFetch(admin, record, {
        url: `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        method: 'DELETE',
      })
      if (response.status !== 204 && response.status !== 200) {
        const payload: any = await response.json().catch(() => ({}))
        throw new Error(`graph_delete_event_${response.status}_${safeProviderError(payload.error)}`)
      }

      return json(200, origin, {eventId, deleted: true})
    }

    if (action === 'get-event') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const eventId = cleanText(body.eventId, 180)

      if (!eventId) throw new ApplicationError(400, 'Event ID is required.')

      const response = await providerFetch(admin, record, {
        url: `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      })
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`graph_get_event_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        id: payload.id,
        subject: payload.subject,
        bodyPreview: payload.bodyPreview,
        body: payload.body,
        location: payload.location,
        start: payload.start,
        end: payload.end,
        attendees: payload.attendees || [],
        onlineMeeting: payload.onlineMeeting,
        webLink: payload.webLink,
        isOnlineMeeting: payload.isOnlineMeeting,
        showAs: payload.showAs,
        importance: payload.importance,
        sensitivity: payload.sensitivity,
        createdDateTime: payload.createdDateTime,
        lastModifiedDateTime: payload.lastModifiedDateTime,
      })
    }

    if (action === 'list-events') {
      const calendarId = cleanText(body.calendarId || 'primary', 180)
      const timeMin = cleanText(body.timeMin, 80)
      const timeMax = cleanText(body.timeMax, 80)
      const top = Math.min(Math.max(Number(body.top) || 50, 1), 250)
      const filter = cleanText(body.filter || '', 500)
      const skip = Math.max(Number(body.skip) || 0, 0)

      let url = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events?$top=${top}&$skip=${skip}&$orderby=start/dateTime`
      const filterParts: string[] = []
      if (timeMin) filterParts.push(`start/dateTime ge '${timeMin}'`)
      if (timeMax) filterParts.push(`end/dateTime le '${timeMax}'`)
      if (filter) filterParts.push(filter)
      if (filterParts.length) url += `&$filter=${encodeURIComponent(filterParts.join(' and '))}`

      const response = await providerFetch(admin, record, {url})
      const payload: any = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`graph_list_events_${response.status}_${safeProviderError(payload.error)}`)

      return json(200, origin, {
        events: (payload.value || []).map((e: any) => ({
          id: e.id,
          subject: e.subject,
          bodyPreview: e.bodyPreview,
          location: e.location,
          start: e.start,
          end: e.end,
          attendees: e.attendees || [],
          onlineMeeting: e.onlineMeeting,
          webLink: e.webLink,
          isOnlineMeeting: e.isOnlineMeeting,
          showAs: e.showAs,
          importance: e.importance,
          sensitivity: e.sensitivity,
        })),
        nextLink: payload['@odata.nextLink'] || null,
      })
    }

    throw new ApplicationError(400, 'Unknown Office 365 Calendar action.')
  } catch (error: any) {
    if (error instanceof ApplicationError)
      return json(error.statusCode, origin, {error: error.message})
    console.error('O365_CALENDAR_OPERATIONS_ERROR', safeProviderError(error))
    return json(500, origin, {error: 'The Office 365 Calendar operation could not be completed.'})
  }
}
