import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {
  ApplicationError,
  bearerToken,
  cleanText,
  corsHeaders,
  json,
  parseJsonBody,
} from "./_applicationUtils";
import {checkRateLimit} from "./_rateLimit";

const RECRUITER_STATUSES = new Set([
  "viewed",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "unsuccessful",
]);

function cleanIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item, 180)).filter(Boolean))).slice(0, 50);
}

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item, 40)).filter(Boolean))).slice(0, 12);
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 204, headers: corsHeaders(origin), body: ""};
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

    const rateLimit = await checkRateLimit({
      admin,
      action: "recruiter-bulk-application-update",
      identifier: decoded.uid,
      limit: 30,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {error: "Too many bulk updates. Please try again shortly."},
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    const body = parseJsonBody(event);
    const applicationIds = cleanIds(body.applicationIds);
    const status = cleanText(body.status, 40).toLowerCase();
    const addTags = cleanTags(body.addTags);
    const hasTalentPoolUpdate = typeof body.talentPool === "boolean";

    if (!applicationIds.length) throw new ApplicationError(400, "Select at least one application.");
    if (status && !RECRUITER_STATUSES.has(status)) {
      throw new ApplicationError(400, "Select a valid application status.");
    }
    if (!status && !addTags.length && !hasTalentPoolUpdate) {
      throw new ApplicationError(400, "Choose a bulk action.");
    }

    const db = admin.firestore();
    const refs = applicationIds.map((id) => db.doc(`applications/${id}`));
    const snapshots = await db.getAll(...refs);
    const missing = snapshots.find((snapshot: any) => !snapshot.exists);
    if (missing) throw new ApplicationError(404, "One of the selected applications no longer exists.");

    const unauthorized = snapshots.find((snapshot: any) => {
      const data = snapshot.data() || {};
      return decoded.admin !== true && data.recruiterId !== decoded.uid;
    });
    if (unauthorized) {
      throw new ApplicationError(403, "You do not have access to every selected application.");
    }
    if (hasTalentPoolUpdate && body.talentPool === true) {
      const nowMillis = Date.now();
      const withoutConsent = snapshots.find((snapshot: any) => {
        const data = snapshot.data() || {};
        const expiresAt = data.talentPoolConsentExpiresAt?.toMillis?.() || 0;
        return data.talentPoolConsent !== true || expiresAt <= nowMillis;
      });
      if (withoutConsent) {
        throw new ApplicationError(400, "Every selected candidate must opt in to future opportunities before joining the talent pool.");
      }
    }

    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();
    snapshots.forEach((snapshot: any) => {
      const current = snapshot.data() || {};
      const updates: Record<string, any> = {updatedAt: now};
      if (status) {
        updates.status = status;
        updates.statusHistory = admin.firestore.FieldValue.arrayUnion({
          status,
          at: now,
          actor: "recruiter",
        });
        if (status === "viewed" && !current.viewedAt) updates.viewedAt = now;
      }
      if (addTags.length) {
        updates.tags = admin.firestore.FieldValue.arrayUnion(...addTags);
      }
      if (hasTalentPoolUpdate) {
        updates.talentPool = body.talentPool;
        updates.talentPoolUpdatedAt = now;
      }
      batch.update(snapshot.ref, updates);
    });
    await batch.commit();

    return json(200, origin, {
      updated: applicationIds.length,
      status: status || null,
      tagsAdded: addTags,
      talentPool: hasTalentPoolUpdate ? body.talentPool : null,
    });
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }
    console.error("BULK_UPDATE_JOB_APPLICATIONS_ERROR", error);
    return json(500, origin, {error: "Could not update the selected applications. Please try again."});
  }
};
