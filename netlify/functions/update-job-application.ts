import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {
  ApplicationError,
  bearerToken,
  cleanMultiline,
  cleanText,
  corsHeaders,
  json,
  parseJsonBody,
} from "./_applicationUtils";
import {enqueuePartnerWebhook} from "./_partnerWebhooks";

const RECRUITER_STATUSES = new Set([
  "viewed",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "unsuccessful",
]);

const SCORECARD_RECOMMENDATIONS = new Set([
  "strong_yes",
  "yes",
  "consider",
  "no",
  "not_scored",
]);
const INTERVIEW_MODES = new Set(["in_person", "phone", "teams", "zoom", "google_meet", "other"]);

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return null;
  return Array.from(new Set(value.map((item) => cleanText(item, 40)).filter(Boolean))).slice(0, 12);
}

function cleanScorecard(value: any) {
  if (!value || typeof value !== "object" || !Array.isArray(value.criteria)) return null;

  const criteria = value.criteria.slice(0, 8).map((criterion: any, index: number) => {
    const score = Math.max(0, Math.min(5, Number(criterion?.score) || 0));
    const weight = Math.max(0, Math.min(100, Number(criterion?.weight) || 0));
    return {
      id: cleanText(criterion?.id, 60) || `criterion_${index + 1}`,
      label: cleanText(criterion?.label, 100) || `Criterion ${index + 1}`,
      score,
      weight,
      evidence: cleanMultiline(criterion?.evidence, 700),
    };
  });
  if (!criteria.length) return null;

  const totalWeight = criteria.reduce((sum: number, criterion: any) => sum + criterion.weight, 0);
  const uniqueIds = new Set(criteria.map((criterion: any) => criterion.id));
  if (uniqueIds.size !== criteria.length) {
    throw new ApplicationError(400, "Scorecard criteria must be unique.");
  }
  if (Math.round(totalWeight) !== 100) {
    throw new ApplicationError(400, "Scorecard weights must total 100%.");
  }
  const weightedScore = totalWeight
    ? Math.round(criteria.reduce((sum: number, criterion: any) => sum + criterion.score * criterion.weight, 0) / (5 * totalWeight) * 100)
    : 0;
  const requestedRecommendation = cleanText(value.recommendation, 40).toLowerCase();

  return {
    version: 1,
    criteria,
    weightedScore,
    recommendation: SCORECARD_RECOMMENDATIONS.has(requestedRecommendation)
      ? requestedRecommendation
      : "not_scored",
    summary: cleanMultiline(value.summary, 1200),
  };
}

function cleanInterview(value: any) {
  if (!value || typeof value !== "object") return null;
  const status = cleanText(value.status, 20).toLowerCase();
  if (status === "cancelled") return {status: "cancelled"};

  const startsAt = new Date(cleanText(value.startsAt, 80));
  if (Number.isNaN(startsAt.getTime())) {
    throw new ApplicationError(400, "Choose a valid interview date and time.");
  }
  const requestedMode = cleanText(value.mode, 40).toLowerCase();
  const durationMinutes = Math.max(15, Math.min(180, Math.round(Number(value.durationMinutes) || 30)));

  return {
    status: "scheduled",
    startsAt: startsAt.toISOString(),
    durationMinutes,
    mode: INTERVIEW_MODES.has(requestedMode) ? requestedMode : "other",
    timezone: cleanText(value.timezone, 80) || "Africa/Johannesburg",
    locationOrLink: cleanText(value.locationOrLink, 500),
    notes: cleanMultiline(value.notes, 1200),
  };
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

    const body = parseJsonBody(event);
    const applicationId = cleanText(body.applicationId, 180);
    const requestedStatus = cleanText(body.status, 40).toLowerCase();
    const note = cleanMultiline(body.note, 1500);
    const tags = cleanTags(body.tags);
    const hasTalentPoolUpdate = typeof body.talentPool === "boolean";
    const hasTalentPoolConsentUpdate = typeof body.talentPoolConsent === "boolean";
    const scorecard = cleanScorecard(body.scorecard);
    const interview = cleanInterview(body.interview);
    if (!applicationId) throw new ApplicationError(400, "Application ID is required.");

    const db = admin.firestore();
    const applicationRef = db.doc(`applications/${applicationId}`);
    const applicationSnap = await applicationRef.get();
    if (!applicationSnap.exists) throw new ApplicationError(404, "Application not found.");
    const application = applicationSnap.data() || {};

    const isAdmin = decoded.admin === true;
    const isRecruiterOwner = decoded.recruiter === true && application.recruiterId === decoded.uid;
    const isCandidateOwner = application.candidateId === decoded.uid;
    if (!isAdmin && !isRecruiterOwner && !isCandidateOwner) {
      throw new ApplicationError(403, "You do not have access to this application.");
    }

    const candidateCanUpdate = requestedStatus === "withdrawn"
      || (hasTalentPoolConsentUpdate && body.talentPoolConsent === false && !requestedStatus);
    if (isCandidateOwner && !isRecruiterOwner && !candidateCanUpdate) {
      throw new ApplicationError(403, "Candidates can only withdraw an application or revoke future-opportunity consent.");
    }
    if ((isRecruiterOwner || isAdmin) && requestedStatus && !RECRUITER_STATUSES.has(requestedStatus)) {
      throw new ApplicationError(400, "Select a valid application status.");
    }
    if (hasTalentPoolConsentUpdate && !isCandidateOwner && !isAdmin) {
      throw new ApplicationError(403, "Only the candidate can change future-opportunity consent.");
    }
    if (!requestedStatus && !note && tags === null && !hasTalentPoolUpdate && !hasTalentPoolConsentUpdate && !scorecard && !interview) {
      throw new ApplicationError(400, "Choose an application update to save.");
    }

    const now = admin.firestore.Timestamp.now();
    const applicationUpdates: Record<string, any> = {};
    if (requestedStatus) {
      Object.assign(applicationUpdates, {
        status: requestedStatus,
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: requestedStatus,
          at: now,
          actor: isRecruiterOwner || isAdmin ? "recruiter" : "candidate",
        }),
        ...(requestedStatus === "viewed" && !application.viewedAt ? {viewedAt: now} : {}),
      });
    }

    if (tags !== null && (isRecruiterOwner || isAdmin)) {
      applicationUpdates.tags = tags;
    }
    if (hasTalentPoolUpdate && (isRecruiterOwner || isAdmin)) {
      const consentExpiresAt = application.talentPoolConsentExpiresAt?.toMillis?.() || 0;
      if (body.talentPool === true && (application.talentPoolConsent !== true || consentExpiresAt <= Date.now())) {
        throw new ApplicationError(400, "This candidate has not opted in to future opportunities.");
      }
      applicationUpdates.talentPool = body.talentPool;
      applicationUpdates.talentPoolUpdatedAt = now;
    }
    if (hasTalentPoolConsentUpdate && isCandidateOwner && body.talentPoolConsent === false) {
      applicationUpdates.talentPoolConsent = false;
      applicationUpdates.talentPoolConsentRevokedAt = now;
      applicationUpdates.talentPool = false;
      applicationUpdates.talentPoolUpdatedAt = now;
    }
    if (scorecard && (isRecruiterOwner || isAdmin)) {
      applicationUpdates.scorecard = {
        ...scorecard,
        reviewedAt: now,
        reviewerId: decoded.uid,
      };
    }
    if (interview && (isRecruiterOwner || isAdmin)) {
      applicationUpdates.interviewSchedule = {
        ...interview,
        updatedAt: now,
        updatedBy: decoded.uid,
      };
    }
    if (Object.keys(applicationUpdates).length) {
      applicationUpdates.updatedAt = now;
      await applicationRef.update(applicationUpdates);
    }

    if (note && (isRecruiterOwner || isAdmin)) {
      await db.doc(`applicationNotes/${applicationId}`).set(
        {
          applicationId,
          recruiterId: application.recruiterId,
          note,
          updatedAt: now,
          updatedBy: decoded.uid,
        },
        {merge: true},
      );
    }

    if (requestedStatus && (isRecruiterOwner || isAdmin)) {
      await enqueuePartnerWebhook({
        recruiterId: application.recruiterId,
        event: "application.stage_changed",
        data: {
          applicationId,
          jobId: application.jobId,
          previousStatus: application.status || null,
          status: requestedStatus,
        },
      }).catch((error) => {
        console.error("APPLICATION_WEBHOOK_ENQUEUE_ERROR", error);
      });
    }

    return json(200, origin, {
      applicationId,
      status: requestedStatus || application.status,
      weightedScore: scorecard?.weightedScore ?? application.scorecard?.weightedScore ?? null,
      message: note && !requestedStatus && !scorecard && !interview
        ? "Private note saved."
        : "Application updated.",
    });
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }
    console.error("UPDATE_JOB_APPLICATION_ERROR", error);
    return json(500, origin, {error: "Could not update this application. Please try again."});
  }
};
