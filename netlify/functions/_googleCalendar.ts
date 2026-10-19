export type GoogleCalendarEventInput = {
  calendarId: string
  idempotencyKey: string
  summary: string
  description: string
  location: string
  start: string
  end: string
  timeZone: string
  attendees: Array<{email: string; displayName: string}>
  conferenceData: boolean
}

export function buildGoogleCalendarCreateRequest(input: GoogleCalendarEventInput) {
  if (!/^[0-9a-f]{32}$/.test(input.idempotencyKey)) {
    throw new Error('A 32 character hexadecimal event key is required.')
  }
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`,
  )
  url.searchParams.set('sendUpdates', 'all')
  if (input.conferenceData) url.searchParams.set('conferenceDataVersion', '1')

  const body: Record<string, any> = {
    id: input.idempotencyKey,
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: {dateTime: input.start, timeZone: input.timeZone},
    end: {dateTime: input.end, timeZone: input.timeZone},
    attendees: input.attendees.map((attendee) => ({
      email: attendee.email,
      ...(attendee.displayName ? {displayName: attendee.displayName} : {}),
      responseStatus: 'needsAction',
    })),
    reminders: {useDefault: true},
  }

  if (input.conferenceData) {
    body.conferenceData = {
      createRequest: {
        requestId: input.idempotencyKey,
        conferenceSolutionKey: {type: 'hangoutsMeet'},
      },
    }
  }

  return {url: url.toString(), body}
}

export function validCalendarEventWindow(start: string, end: string) {
  const startTime = Date.parse(start)
  const endTime = Date.parse(end)
  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime
}

export function normalizeGoogleCalendarAttendees(value: unknown) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error('Calendar events can include up to 50 attendees.')
  }
  return value.map((entry) => {
    const attendee = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    const email = String(attendee.email || '').trim().slice(0, 254)
    const displayName = String(attendee.displayName || '').trim().slice(0, 160)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Each calendar attendee needs a valid email address.')
    }
    return {email, displayName}
  })
}
