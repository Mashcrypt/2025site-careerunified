import crypto from "crypto";
import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {sendTransactionalEmail} from "./_notify";
import {userAllowsNotification} from "./_notificationPreferences";
import {checkRateLimit} from "./_rateLimit";
import {
  ApplicationError,
  bearerToken,
  cleanMultiline,
  cleanText,
  corsHeaders,
  json,
  parseJsonBody,
} from "./_applicationUtils";

const MESSAGE_TYPES = new Set([
  "application_update",
  "shortlisted",
  "request_information",
  "interview",
  "offer",
  "outcome",
  "custom",
]);

const APPLICATION_UPDATE_TYPES = new Set([
  "application_update",
  "shortlisted",
  "interview",
  "offer",
  "outcome",
]);

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function messageIdFor(applicationId: string, recruiterId: string, clientMessageId: string) {
  return crypto
    .createHash("sha256")
    .update(`${applicationId}:${recruiterId}:${clientMessageId}`)
    .digest("hex")
    .slice(0, 48);
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 200, headers: corsHeaders(origin), body: ""};
  }
  if (event.httpMethod !== "POST") {
    return json(405, origin, {error: "Method Not Allowed"});
  }

  try {
    const admin = getAdmin();
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please log in.");

    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please log in again.");
    }
    if (decoded.recruiter !== true && decoded.admin !== true) {
      throw new ApplicationError(403, "Recruiter access is required.");
    }

    const body = parseJsonBody(event);
    const applicationId = cleanText(body.applicationId, 180);
    const type = cleanText(body.type, 40).toLowerCase();
    const subject = cleanText(body.subject, 180);
    const message = cleanMultiline(body.message, 5000);
    const clientMessageId = cleanText(body.clientMessageId, 96);

    if (!applicationId) throw new ApplicationError(400, "Application ID is required.");
    if (!MESSAGE_TYPES.has(type)) throw new ApplicationError(400, "Select a valid email type.");
    if (!subject) throw new ApplicationError(400, "Email subject is required.");
    if (!message) throw new ApplicationError(400, "Write a message before sending.");
    if (!/^[A-Za-z0-9_-]{16,96}$/.test(clientMessageId)) {
      throw new ApplicationError(400, "Could not prepare this email. Please try again.");
    }

    const db = admin.firestore();
    const applicationRef = db.doc(`applications/${applicationId}`);
    const applicationSnap = await applicationRef.get();
    if (!applicationSnap.exists) throw new ApplicationError(404, "Application not found.");
    const application = applicationSnap.data() || {};
    const isAdmin = decoded.admin === true;
    const isRecruiterOwner = decoded.recruiter === true && application.recruiterId === decoded.uid;
    if (!isAdmin && !isRecruiterOwner) {
      throw new ApplicationError(403, "You do not have access to this application.");
    }

    const candidate = application.candidateSnapshot || {};
    const candidateEmail = cleanText(candidate.email, 254).toLowerCase();
    if (!isEmail(candidateEmail)) {
      throw new ApplicationError(400, "This candidate does not have a valid email address.");
    }

    const candidateId = cleanText(application.candidateId, 180);
    if (candidateId) {
      const notificationDecision = await userAllowsNotification({
        admin,
        userId: candidateId,
        channel: "email",
        updateType: APPLICATION_UPDATE_TYPES.has(type) ? "applicationUpdates" : "recruiterMessages",
        allowWhenMissing: true,
      });
      if (!notificationDecision.allowed) {
        throw new ApplicationError(
          409,
          "This candidate has disabled this type of email notification. The message was not sent.",
        );
      }
    }

    const messageRef = db.doc(
      `applicationMessages/${messageIdFor(applicationId, decoded.uid, clientMessageId)}`,
    );
    const existingMessage = await messageRef.get();
    if (existingMessage.exists) {
      const existing = existingMessage.data() || {};
      if (existing.status === "sent") {
        return json(200, origin, {
          messageId: existingMessage.id,
          status: "sent",
          message: "This email was already sent.",
        });
      }
      if (existing.status === "sending") {
        return json(202, origin, {
          messageId: existingMessage.id,
          status: "sending",
          message: "This email is already being sent.",
        });
      }
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "recruiter-candidate-email",
      identifier: `uid:${decoded.uid}`,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {
          error: "You have sent a lot of candidate emails recently. Please try again later.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    const recruiterSnap = await db.doc(`recruiters/${application.recruiterId}`).get();
    const recruiter = recruiterSnap.data() || {};
    const companyProfile = recruiter.companyProfile && typeof recruiter.companyProfile === "object"
      ? recruiter.companyProfile
      : {};
    const job = application.jobSnapshot || {};
    const companyName = cleanText(job.company || companyProfile.name, 160) || "Career Unified";
    const replyToCandidate = cleanText(companyProfile.email || decoded.email, 254).toLowerCase();
    const replyTo = isEmail(replyToCandidate) ? replyToCandidate : "";
    const now = admin.firestore.Timestamp.now();

    await messageRef.set({
      applicationId,
      recruiterId: application.recruiterId,
      candidateId,
      jobId: cleanText(application.jobId, 180),
      type,
      channel: "email",
      status: "sending",
      subject,
      body: message,
      recipientEmail: candidateEmail,
      senderName: companyName,
      replyTo,
      createdAt: now,
      sentBy: decoded.uid,
    });

    try {
      const email = await sendTransactionalEmail({
        to: candidateEmail,
        subject,
        text: `${message}\n\nSent through Career Unified`,
        replyTo,
        tag: "candidate-communication",
      });

      await messageRef.update({
        status: "sent",
        providerMessageId: email.id || null,
        sentAt: admin.firestore.Timestamp.now(),
      });
    } catch (error) {
      await messageRef.update({
        status: "failed",
        failedAt: admin.firestore.Timestamp.now(),
      });
      console.error("SEND_APPLICATION_MESSAGE_DELIVERY_ERROR", error);
      throw new ApplicationError(502, "We could not send this email. Please try again.");
    }

    return json(201, origin, {
      messageId: messageRef.id,
      status: "sent",
      message: "Candidate email sent.",
      remaining: rateLimit.remaining,
    });
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }
    console.error("SEND_APPLICATION_MESSAGE_ERROR", error);
    return json(500, origin, {error: "Could not send this email. Please try again."});
  }
};
