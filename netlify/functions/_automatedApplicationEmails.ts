import {createHash} from "node:crypto";
import {cleanMultiline, cleanText} from "./_applicationUtils";

export const AUTOMATED_APPLICATION_EMAIL_STATUSES = new Set([
  "viewed",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "unsuccessful",
]);

const TEMPLATE_KEYS = new Set([
  "application_update",
  "reviewed",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "outcome",
  "custom",
]);
const DELIVERY_DELAYS = new Set([0, 12, 24, 48]);

export function normalizeAutomatedEmails(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seenStatuses = new Set<string>();
  return value.slice(0, 6).flatMap((item: any, index: number) => {
    const status = cleanText(item?.status, 40).toLowerCase();
    if (!AUTOMATED_APPLICATION_EMAIL_STATUSES.has(status) || seenStatuses.has(status)) return [];
    const requestedTemplate = cleanText(item?.templateKey, 60).toLowerCase();
    const templateKey = TEMPLATE_KEYS.has(requestedTemplate) ? requestedTemplate : "custom";
    const delayHours = Number(item?.delayHours);
    const subject = cleanText(item?.subject, 180);
    const message = cleanMultiline(item?.message, 4000);
    const fromName = cleanText(item?.fromName, 120);
    if (!subject || !message || !fromName) return [];
    seenStatuses.add(status);
    return [{
      id: cleanText(item?.id, 80) || `automated_email_${index + 1}`,
      status,
      templateKey,
      delayHours: DELIVERY_DELAYS.has(delayHours) ? delayHours : 0,
      fromName,
      subject,
      message,
    }];
  });
}

export async function enqueueAutomatedApplicationEmail(
  admin: any,
  application: Record<string, any>,
  status: string,
  transitionKey: string,
  applicationIdOverride = "",
) {
  const normalizedStatus = cleanText(status, 40).toLowerCase();
  if (!AUTOMATED_APPLICATION_EMAIL_STATUSES.has(normalizedStatus)) return false;

  const recruiterId = cleanText(application.recruiterId, 160);
  const jobId = cleanText(application.jobId, 180);
  const applicationId = cleanText(applicationIdOverride || application.applicationId, 180);
  const candidateId = cleanText(application.candidateId, 180);
  const candidate = application.candidateSnapshot || {};
  const candidateEmail = cleanText(candidate.email, 254).toLowerCase();
  if (!recruiterId || !jobId || !applicationId || !candidateId || !candidateEmail) return false;

  const db = admin.firestore();
  const jobSnapshot = await db.doc(`jobs/${jobId}`).get();
  if (!jobSnapshot.exists) return false;
  const job = jobSnapshot.data() || {};
  if (cleanText(job.recruiterId, 160) !== recruiterId) return false;

  const rule = normalizeAutomatedEmails(job.automatedEmails)
    .find((item: any) => item.status === normalizedStatus);
  if (!rule) return false;

  const now = admin.firestore.Timestamp.now();
  const triggeredAtMillis = Number(transitionKey) || now.toMillis();
  const triggeredAt = admin.firestore.Timestamp.fromMillis(triggeredAtMillis);
  const scheduledAt = admin.firestore.Timestamp.fromMillis(
    triggeredAtMillis + rule.delayHours * 60 * 60 * 1000,
  );
  const queueId = createHash("sha256")
    .update(`${applicationId}:${normalizedStatus}:${transitionKey}`)
    .digest("hex")
    .slice(0, 48);
  const queueRef = db.doc(`automatedApplicationEmails/${queueId}`);
  try {
    await queueRef.create({
      applicationId,
      recruiterId,
      jobId,
      candidateId,
      candidateName: cleanText(candidate.fullName, 120) || "there",
      candidateEmail,
      triggerStatus: normalizedStatus,
      templateKey: rule.templateKey,
      subjectTemplate: rule.subject,
      messageTemplate: rule.message,
      fromName: rule.fromName || cleanText(job.company, 160) || "Recruitment Team",
      replyTo: cleanText(job.email, 254).toLowerCase(),
      companyName: cleanText(job.company, 160) || "the employer",
      jobTitle: cleanText(job.title, 180) || "the role",
      status: "queued",
      delayHours: rule.delayHours,
      triggeredAt,
      scheduledAt,
      createdAt: now,
      attemptCount: 0,
      leaseUntil: null,
    });
    return true;
  } catch (error: any) {
    if (error?.code === 6 || error?.code === "already-exists") return false;
    throw error;
  }
}
