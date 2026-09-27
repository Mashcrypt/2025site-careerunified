import crypto from 'crypto'
import type {Handler} from '@netlify/functions'
import {getAdmin} from './_firebaseAdmin'
import {sendTransactionalEmail} from './_notify'
import {userAllowsNotification} from './_notificationPreferences'
import {checkRateLimit} from './_rateLimit'
import {sendConnectedEmail} from './_connectedEmail'
import {safeProviderError} from './_recruiterIntegrations'
import {
  ApplicationError,
  bearerToken,
  cleanMultiline,
  cleanText,
  corsHeaders,
  json,
  parseJsonBody,
} from './_applicationUtils'

const MESSAGE_TYPES = new Set([
  'application_update',
  'shortlisted',
  'request_information',
  'interview',
  'offer',
  'outcome',
  'custom',
])

const APPLICATION_UPDATE_TYPES = new Set([
  'application_update',
  'shortlisted',
  'interview',
  'offer',
  'outcome',
])

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeImageUrl(value: unknown) {
  const candidate = cleanText(value, 2000)
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function brandedHtml(message: string, companyName: string, logoUrl: string) {
  const paragraphs = escapeHtml(message)
    .split(/\n\s*\n/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;line-height:1.6;">${paragraph.replace(/\n/g, '<br>')}</p>`,
    )
    .join('')
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)}" width="120" style="display:block;max-width:120px;height:auto;margin:0 auto 10px;">`
    : ''

  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;color:#16213d;font-family:Arial,Helvetica,sans-serif;padding:24px 12px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:32px 36px 20px;font-size:16px;">${paragraphs}</td></tr>
        <tr><td style="padding:20px 36px 26px;border-top:1px solid #e6ebf2;text-align:center;color:#667085;font-size:12px;">
          ${logo}<div>${escapeHtml(companyName)} · Sent through Career Unified</div>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`
}

function brandedSender(companyName: string) {
  const configured = cleanText(
    process.env.RESEND_FROM_EMAIL || 'no-reply@mail.careerunified.com',
    254,
  )
  const addressMatch =
    configured.match(/<([^<>\s]+@[^<>\s]+)>/) || configured.match(/([^<>\s]+@[^<>\s]+)/)
  const address = addressMatch?.[1] || 'no-reply@mail.careerunified.com'
  const name = cleanText(companyName, 120).replace(/[<>]/g, '') || 'Career Unified'
  return `${name} <${address}>`
}

function messageIdFor(applicationId: string, recruiterId: string, clientMessageId: string) {
  return crypto
    .createHash('sha256')
    .update(`${applicationId}:${recruiterId}:${clientMessageId}`)
    .digest('hex')
    .slice(0, 48)
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: corsHeaders(origin), body: ''}
  }
  if (event.httpMethod !== 'POST') {
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
    if (decoded.recruiter !== true && decoded.admin !== true) {
      throw new ApplicationError(403, 'Recruiter access is required.')
    }

    const body = parseJsonBody(event)
    const applicationId = cleanText(body.applicationId, 180)
    const type = cleanText(body.type, 40).toLowerCase()
    const subject = cleanText(body.subject, 180)
    const message = cleanMultiline(body.message, 5000)
    const clientMessageId = cleanText(body.clientMessageId, 96)
    const senderProvider = cleanText(body.senderProvider || 'resend', 40).toLowerCase()

    if (!applicationId) throw new ApplicationError(400, 'Application ID is required.')
    if (!MESSAGE_TYPES.has(type)) throw new ApplicationError(400, 'Select a valid email type.')
    if (!subject) throw new ApplicationError(400, 'Email subject is required.')
    if (!message) throw new ApplicationError(400, 'Write a message before sending.')
    if (!/^[A-Za-z0-9_-]{16,96}$/.test(clientMessageId)) {
      throw new ApplicationError(400, 'Could not prepare this email. Please try again.')
    }
    if (!new Set(['resend', 'gmail', 'outlook-email']).has(senderProvider)) {
      throw new ApplicationError(400, 'Choose a valid sending account.')
    }

    const db = admin.firestore()
    const applicationRef = db.doc(`applications/${applicationId}`)
    const applicationSnap = await applicationRef.get()
    if (!applicationSnap.exists) throw new ApplicationError(404, 'Application not found.')
    const application = applicationSnap.data() || {}
    const isAdmin = decoded.admin === true
    const isRecruiterOwner =
      decoded.recruiter === true && application.recruiterId === (decoded.companyId || decoded.uid)
    if (!isAdmin && !isRecruiterOwner) {
      throw new ApplicationError(403, 'You do not have access to this application.')
    }

    const candidate = application.candidateSnapshot || {}
    const candidateId = cleanText(application.candidateId, 180)
    let candidateEmail = cleanText(candidate.email, 254).toLowerCase()

    if (!isEmail(candidateEmail) && candidateId) {
      const [authResult, profileResult] = await Promise.allSettled([
        admin.auth().getUser(candidateId),
        db.doc(`users/${candidateId}`).get(),
      ])
      const authEmail =
        authResult.status === 'fulfilled'
          ? cleanText(authResult.value?.email, 254).toLowerCase()
          : ''
      const profileEmail =
        profileResult.status === 'fulfilled'
          ? cleanText(profileResult.value?.data()?.email, 254).toLowerCase()
          : ''
      candidateEmail = isEmail(authEmail) ? authEmail : profileEmail

      if (isEmail(candidateEmail)) {
        await applicationRef.update({
          'candidateSnapshot.email': candidateEmail,
          updatedAt: admin.firestore.Timestamp.now(),
        })
      }
    }

    if (!isEmail(candidateEmail)) {
      throw new ApplicationError(
        400,
        'This candidate does not have a valid account email. Ask them to update their Career Unified profile.',
      )
    }

    let emailDeliveryAllowed = true
    if (candidateId) {
      const isApplicationUpdate = APPLICATION_UPDATE_TYPES.has(type)
      const notificationDecision = await userAllowsNotification({
        admin,
        userId: candidateId,
        channel: 'email',
        updateType: isApplicationUpdate ? 'applicationUpdates' : 'recruiterMessages',
        allowWhenMissing: isApplicationUpdate,
      })
      emailDeliveryAllowed = notificationDecision.allowed
    }

    const messageRef = db.doc(
      `applicationMessages/${messageIdFor(applicationId, decoded.uid, clientMessageId)}`,
    )
    const existingMessage = await messageRef.get()
    if (existingMessage.exists) {
      const existing = existingMessage.data() || {}
      if (existing.status === 'sent') {
        return json(200, origin, {
          messageId: existingMessage.id,
          status: 'sent',
          emailSent: existing.emailSent !== false,
          portalOnly: existing.emailSent === false,
          message: 'This email was already sent.',
        })
      }
      if (existing.status === 'sending') {
        return json(202, origin, {
          messageId: existingMessage.id,
          status: 'sending',
          message: 'This email is already being sent.',
        })
      }
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: 'recruiter-candidate-email',
      identifier: `uid:${decoded.uid}`,
      limit: 30,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {
          error: 'You have sent a lot of candidate emails recently. Please try again later.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {'Retry-After': String(rateLimit.retryAfterSeconds)},
      )
    }

    const recruiterSnap = await db.doc(`recruiters/${application.recruiterId}`).get()
    const recruiter = recruiterSnap.data() || {}
    const companyProfile =
      recruiter.companyProfile && typeof recruiter.companyProfile === 'object'
        ? recruiter.companyProfile
        : {}
    const job = application.jobSnapshot || {}
    const companyName = cleanText(job.company || companyProfile.name, 160) || 'Career Unified'
    const logoUrl = safeImageUrl(companyProfile.logo || job.logo || job.companyLogo)
    const replyToCandidate = cleanText(companyProfile.email || decoded.email, 254).toLowerCase()
    const replyTo = isEmail(replyToCandidate) ? replyToCandidate : ''
    let connectedEmailRecord: any = null
    if (senderProvider !== 'resend') {
      const connectedSnap = await db
        .doc(`recruiterIntegrations/${application.recruiterId}_${senderProvider}`)
        .get()
      connectedEmailRecord = connectedSnap.data() || null
      if (
        !connectedSnap.exists ||
        connectedEmailRecord.connectionStatus !== 'connected' ||
        !connectedEmailRecord.providerEmail
      ) {
        throw new ApplicationError(
          409,
          'The selected connected email account is not ready. Reconnect it before sending.',
        )
      }
    }
    const now = admin.firestore.Timestamp.now()

    await messageRef.set({
      applicationId,
      recruiterId: application.recruiterId,
      candidateId,
      jobId: cleanText(application.jobId, 180),
      type,
      channel: 'email',
      status: 'sending',
      delivery: emailDeliveryAllowed ? 'email_pending' : 'portal_only',
      emailSent: false,
      subject,
      body: message,
      recipientEmail: candidateEmail,
      senderName: companyName,
      senderProvider,
      senderAccount:
        senderProvider === 'resend'
          ? brandedSender(companyName)
          : connectedEmailRecord.providerEmail,
      replyTo,
      createdAt: now,
      sentBy: decoded.uid,
    })

    if (!emailDeliveryAllowed) {
      await messageRef.update({
        status: 'sent',
        delivery: 'portal_only',
        emailSent: false,
        sentAt: admin.firestore.Timestamp.now(),
      })

      return json(201, origin, {
        messageId: messageRef.id,
        status: 'sent',
        emailSent: false,
        portalOnly: true,
        message:
          'Message saved to the candidate portal. Email notifications are disabled for this candidate.',
        remaining: rateLimit.remaining,
      })
    }

    try {
      const email =
        senderProvider === 'resend'
          ? await sendTransactionalEmail({
              to: candidateEmail,
              from: brandedSender(companyName),
              subject,
              text: `${message}\n\nSent through Career Unified`,
              html: brandedHtml(message, companyName, logoUrl),
              replyTo,
              tag: 'candidate-communication',
            })
          : await sendConnectedEmail(admin, connectedEmailRecord, {
              to: candidateEmail,
              subject,
              text: `${message}\n\nSent through Career Unified`,
              html: brandedHtml(message, companyName, logoUrl),
              replyTo,
            })

      const providerMessageId = 'id' in email ? email.id : email.providerMessageId
      const providerThreadId =
        'threadId' in email
          ? email.threadId
          : 'providerThreadId' in email
            ? email.providerThreadId
            : null
      await messageRef.update({
        status: 'sent',
        delivery: 'email',
        emailSent: true,
        providerId: senderProvider,
        providerMessageId: providerMessageId || null,
        providerThreadId: providerThreadId || null,
        sentAt: admin.firestore.Timestamp.now(),
      })
    } catch (error) {
      await messageRef.update({
        status: 'failed',
        failedAt: admin.firestore.Timestamp.now(),
      })
      console.error('SEND_APPLICATION_MESSAGE_DELIVERY_ERROR', safeProviderError(error))
      throw new ApplicationError(502, 'We could not send this email. Please try again.')
    }

    return json(201, origin, {
      messageId: messageRef.id,
      status: 'sent',
      emailSent: true,
      portalOnly: false,
      message: 'Candidate email sent.',
      remaining: rateLimit.remaining,
    })
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message})
    }
    console.error('SEND_APPLICATION_MESSAGE_ERROR', error)
    return json(500, origin, {error: 'Could not send this email. Please try again.'})
  }
}
