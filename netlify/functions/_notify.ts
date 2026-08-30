const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'Career Unified <no-reply@mail.careerunified.com>'

type SendTransactionalEmailOptions = {
  to: string | string[]
  subject: string
  text: string
  html?: string
  from?: string
  replyTo?: string
  tag?: string
}

function headerValue(value: unknown, maxLength = 254) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function recipientList(value: string | string[]) {
  const recipients = (Array.isArray(value) ? value : [value])
    .map((email) => headerValue(email).toLowerCase())
    .filter(validEmail)

  return [...new Set(recipients)].slice(0, 50)
}

function tagValue(value: unknown) {
  return headerValue(value, 128)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128)
}

export async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
  from,
  replyTo,
  tag,
}: SendTransactionalEmailOptions) {
  const apiKey = headerValue(process.env.RESEND_API_KEY, 500)
  if (!apiKey) throw new Error('Resend is not configured.')

  const recipients = recipientList(to)
  if (!recipients.length) throw new Error('A valid email recipient is required.')

  const safeSubject = headerValue(subject, 180)
  if (!safeSubject) throw new Error('An email subject is required.')

  const payload: Record<string, unknown> = {
    from: headerValue(from || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM),
    to: recipients,
    subject: safeSubject,
    text: String(text || '').slice(0, 12000),
  }

  if (html) payload.html = String(html).slice(0, 50000)

  const safeReplyTo = headerValue(replyTo)
  if (safeReplyTo && validEmail(safeReplyTo)) payload.reply_to = safeReplyTo

  const safeTag = tagValue(tag)
  if (safeTag) payload.tags = [{name: 'category', value: safeTag}]

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Resend rejected the email with status ${response.status}.`)
  }

  const result = (await response.json().catch(() => ({}))) as {id?: unknown}
  return {id: headerValue(result.id, 240)}
}

export async function sendApprovalEmail(options: {
  to: string | string[]
  subject: string
  text: string
}) {
  return sendTransactionalEmail({...options, tag: 'approval-notification'})
}
