import type {Config, Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {sendTransactionalEmail} from "./_notify";
import {userAllowsNotification} from "./_notificationPreferences";
import {cleanMultiline, cleanText} from "./_applicationUtils";

export const config: Config = {schedule: "*/5 * * * *"};

function timestampMillis(value: any) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function replaceTokens(template: unknown, values: Record<string, string>, maxLength: number) {
  let output = cleanMultiline(template, maxLength);
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function htmlMessage(message: string, companyName: string) {
  const paragraphs = escapeHtml(message)
    .split(/\n\s*\n/)
    .map(paragraph => `<p style="margin:0 0 16px;line-height:1.6;">${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;color:#16213d;font-family:Arial,Helvetica,sans-serif;padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:10px;"><tr><td style="padding:32px 36px 20px;font-size:16px;">${paragraphs}</td></tr><tr><td style="padding:20px 36px 26px;border-top:1px solid #e6ebf2;text-align:center;color:#667085;font-size:12px;">${escapeHtml(companyName)} · Sent through Career Unified</td></tr></table></td></tr></table></body></html>`;
}

function brandedSender(name: unknown) {
  const configured = cleanText(process.env.RESEND_FROM_EMAIL || "no-reply@mail.careerunified.com", 254);
  const address = configured.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1]
    || configured.match(/([^<>\s]+@[^<>\s]+)/)?.[1]
    || "no-reply@mail.careerunified.com";
  const safeName = cleanText(name, 120).replace(/[<>\"]+/g, "") || "Recruitment Team";
  return `${safeName} <${address}>`;
}

async function claimQueueItem(admin: any, ref: any, nowMillis: number) {
  const db = admin.firestore();
  return db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const item = snapshot.data() || {};
    if (item.status !== "queued" || timestampMillis(item.scheduledAt) > nowMillis) return null;
    if (timestampMillis(item.leaseUntil) > nowMillis) return null;
    const attempts = Number(item.attemptCount || 0);
    if (attempts >= 5) {
      transaction.update(ref, {
        status: "failed",
        failedAt: admin.firestore.Timestamp.fromMillis(nowMillis),
        leaseUntil: null,
        lastError: "retry_limit_reached",
      });
      return null;
    }
    transaction.update(ref, {
      attemptCount: attempts + 1,
      leaseUntil: admin.firestore.Timestamp.fromMillis(nowMillis + 5 * 60 * 1000),
      lastAttemptAt: admin.firestore.Timestamp.fromMillis(nowMillis),
    });
    return {...item, attemptCount: attempts + 1};
  });
}

async function updateQueue(admin: any, ref: any, updates: Record<string, unknown>) {
  await ref.set({...updates, updatedAt: admin.firestore.Timestamp.now()}, {merge: true});
}

async function processQueueItem(admin: any, queueSnapshot: any, nowMillis: number) {
  const db = admin.firestore();
  const queueRef = queueSnapshot.ref;
  const item = await claimQueueItem(admin, queueRef, nowMillis);
  if (!item) return "skipped";

  const applicationRef = db.doc(`applications/${cleanText(item.applicationId, 180)}`);
  const applicationSnap = await applicationRef.get();
  if (!applicationSnap.exists) {
    await updateQueue(admin, queueRef, {status: "cancelled", cancelledAt: admin.firestore.Timestamp.now(), cancelReason: "application_missing", leaseUntil: null});
    return "cancelled";
  }
  const application = applicationSnap.data() || {};
  const triggeredAtMillis = timestampMillis(item.triggeredAt);
  const stageChangedAgain = Array.isArray(application.statusHistory)
    && application.statusHistory.some((entry: any) => timestampMillis(entry?.at) > triggeredAtMillis);
  if (
    application.recruiterId !== item.recruiterId
    || application.jobId !== item.jobId
    || cleanText(application.status, 40).toLowerCase() !== cleanText(item.triggerStatus, 40).toLowerCase()
    || stageChangedAgain
  ) {
    await updateQueue(admin, queueRef, {status: "cancelled", cancelledAt: admin.firestore.Timestamp.now(), cancelReason: "candidate_stage_changed", leaseUntil: null});
    return "cancelled";
  }

  const candidateId = cleanText(item.candidateId, 180);
  const candidateEmail = cleanText(item.candidateEmail, 254).toLowerCase();
  if (!candidateId || !validEmail(candidateEmail)) {
    await updateQueue(admin, queueRef, {status: "failed", failedAt: admin.firestore.Timestamp.now(), failureCode: "invalid_candidate_email", leaseUntil: null});
    return "failed";
  }

  const notification = await userAllowsNotification({
    admin,
    userId: candidateId,
    channel: "email",
    updateType: "applicationUpdates",
    allowWhenMissing: true,
  });
  if (!notification.allowed) {
    await updateQueue(admin, queueRef, {status: "skipped", skippedAt: admin.firestore.Timestamp.now(), skipReason: "candidate_email_notifications_disabled", leaseUntil: null});
    return "skipped";
  }

  const values = {
    candidate_name: cleanText(item.candidateName, 120) || "there",
    job_title: cleanText(item.jobTitle, 180) || "the role",
    company_name: cleanText(item.companyName, 160) || "the employer",
  };
  const subject = replaceTokens(item.subjectTemplate, values, 180).replace(/[\r\n]+/g, " ").trim();
  const message = replaceTokens(item.messageTemplate, values, 4000).trim();
  const from = brandedSender(item.fromName || item.companyName);
  const replyTo = cleanText(item.replyTo, 254).toLowerCase();
  const validReplyTo = validEmail(replyTo) ? replyTo : undefined;
  const messageRef = db.doc(`applicationMessages/${queueSnapshot.id}`);
  const now = admin.firestore.Timestamp.now();
  await messageRef.set({
    applicationId: item.applicationId,
    recruiterId: item.recruiterId,
    candidateId,
    jobId: item.jobId,
    type: "application_update",
    channel: "email",
    status: "sending",
    delivery: "email_pending",
    emailSent: false,
    subject,
    body: message,
    recipientEmail: candidateEmail,
    senderName: cleanText(item.fromName || item.companyName, 120),
    senderProvider: "resend",
    senderAccount: from,
    replyTo: validReplyTo || "",
    automated: true,
    automatedEmailId: queueSnapshot.id,
    createdAt: item.createdAt || now,
    updatedAt: now,
  }, {merge: true});

  try {
    const delivery = await sendTransactionalEmail({
      to: candidateEmail,
      from,
      subject,
      text: `${message}\n\nSent through Career Unified`,
      html: htmlMessage(message, values.company_name),
      replyTo: validReplyTo,
      tag: "automated-candidate-update",
    });
    const sentAt = admin.firestore.Timestamp.now();
    await messageRef.set({
      status: "sent",
      delivery: "email",
      emailSent: true,
      providerId: "resend",
      providerMessageId: delivery.id || null,
      sentAt,
      updatedAt: sentAt,
    }, {merge: true});
    await updateQueue(admin, queueRef, {status: "sent", sentAt, providerMessageId: delivery.id || null, leaseUntil: null, lastError: null});
    return "sent";
  } catch (error) {
    const failedAt = admin.firestore.Timestamp.now();
    await messageRef.set({status: "failed", emailSent: false, failedAt, updatedAt: failedAt}, {merge: true});
    const attempts = Number(item.attemptCount || 1);
    await updateQueue(admin, queueRef, attempts >= 5
      ? {status: "failed", failedAt, failureCode: "delivery_failed", leaseUntil: null}
      : {status: "queued", leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), lastError: "delivery_failed"});
    console.error("AUTOMATED_APPLICATION_EMAIL_DELIVERY_ERROR", {
      queueId: queueSnapshot.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return "failed";
  }
}

export const handler: Handler = async () => {
  try {
    const admin = getAdmin();
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const queued = await db.collection("automatedApplicationEmails")
      .where("status", "==", "queued")
      .get();
    const due = queued.docs
      .filter((snapshot: any) => timestampMillis(snapshot.data()?.scheduledAt) <= now.toMillis())
      .sort((left: any, right: any) => timestampMillis(left.data()?.scheduledAt) - timestampMillis(right.data()?.scheduledAt))
      .slice(0, 30);
    const counts = {sent: 0, cancelled: 0, skipped: 0, failed: 0};
    for (const snapshot of due) {
      const outcome = await processQueueItem(admin, snapshot, now.toMillis());
      if (outcome in counts) counts[outcome as keyof typeof counts] += 1;
    }
    console.info("AUTOMATED_APPLICATION_EMAILS_PROCESSED", counts);
    return {statusCode: 200, body: JSON.stringify(counts)};
  } catch (error) {
    console.error("AUTOMATED_APPLICATION_EMAILS_PROCESSOR_FAILED", error);
    return {statusCode: 500, body: "Automated email processing failed"};
  }
};
