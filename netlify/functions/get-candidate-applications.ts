import type { Handler } from "@netlify/functions";
import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit } from "./_rateLimit";
import {
  ApplicationError,
  bearerToken,
  cleanText,
  corsHeaders,
  json,
} from "./_applicationUtils";

const MAX_APPLICATIONS = 100;

function timestampValue(value: any) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  if (typeof value === "string") return value;
  return "";
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }
  if (event.httpMethod !== "GET") {
    return json(405, origin, { error: "Method Not Allowed" });
  }

  try {
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please log in to view your applications.");

    const admin = getAdmin();
    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please log in again.");
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "candidate-applications-list",
      identifier: decoded.uid,
      limit: 60,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        { error: "Too many application list requests. Please try again shortly." },
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }

    const snapshot = await admin.firestore()
      .collection("applications")
      .where("candidateId", "==", decoded.uid)
      .limit(MAX_APPLICATIONS)
      .get();

    const applications = snapshot.docs.map((applicationSnap) => {
      const application = applicationSnap.data() || {};
      const job = application.jobSnapshot || {};
      const cv = application.cvSnapshot || {};
      const interview = application.interviewSchedule || {};
      return {
        id: applicationSnap.id,
        status: cleanText(application.status || "submitted", 40),
        submittedAt: timestampValue(application.submittedAt),
        jobSnapshot: {
          title: cleanText(job.title, 200),
          company: cleanText(job.company, 160),
          location: cleanText(job.location, 160),
          slug: cleanText(job.slug, 220),
          deadline: cleanText(job.deadline, 80),
        },
        cvSnapshot: {
          fileName: cleanText(cv.fileName, 160),
        },
        talentPoolConsent: application.talentPoolConsent === true,
        talentPoolConsentExpiresAt: timestampValue(application.talentPoolConsentExpiresAt),
        interviewSchedule: interview.status === "scheduled"
          ? {
              status: "scheduled",
              startsAt: timestampValue(interview.startsAt) || cleanText(interview.startsAt, 80),
              durationMinutes: Math.max(15, Math.min(180, Number(interview.durationMinutes) || 30)),
              mode: cleanText(interview.mode, 40),
              timezone: cleanText(interview.timezone, 80),
              locationOrLink: cleanText(interview.locationOrLink, 500),
              notes: cleanText(interview.notes, 1200),
            }
          : null,
      };
    });

    return json(
      200,
      origin,
      { applications },
      { "Cache-Control": "private, no-store" },
    );
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, { error: error.message });
    }
    console.error("GET_CANDIDATE_APPLICATIONS_ERROR", error);
    return json(500, origin, { error: "Could not load your applications. Please try again." });
  }
};
