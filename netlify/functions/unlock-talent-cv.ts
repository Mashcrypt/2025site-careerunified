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
import {recruiterTalentAccess} from "./_recruiterTalentAccess";

export const handler: Handler = async event => {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 200, headers: corsHeaders(origin), body: ""};
  }
  if (event.httpMethod !== "POST") return json(405, origin, {error: "Method Not Allowed"});

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
    if (decoded.recruiter !== true) throw new ApplicationError(403, "Recruiter access is required.");

    const cvId = cleanText(parseJsonBody(event).cvId, 180);
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(cvId)) {
      throw new ApplicationError(400, "A valid CV ID is required.");
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "talent-cv-unlock",
      identifier: `uid:${decoded.uid}`,
      limit: 100,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {error: "Too many CV unlock attempts. Please try again later."},
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    const db = admin.firestore();
    const recruiterRef = db.doc(`recruiters/${decoded.uid}`);
    const cvRef = db.doc(`cvs/${cvId}`);
    const result = await db.runTransaction(async (transaction: any) => {
      const [recruiterSnapshot, cvSnapshot] = await Promise.all([
        transaction.get(recruiterRef),
        transaction.get(cvRef),
      ]);
      if (!recruiterSnapshot.exists) throw new ApplicationError(403, "Recruiter profile not found.");
      if (!cvSnapshot.exists || cvSnapshot.data()?.status === "inactive") {
        throw new ApplicationError(404, "This CV is no longer available.");
      }

      const recruiter = recruiterSnapshot.data() || {};
      const access = recruiterTalentAccess(recruiter);
      if (!access.active) throw new ApplicationError(403, "An active recruiter plan is required.");
      if (access.unlockedCVs.includes(cvId)) {
        return {alreadyUnlocked: true, unlocksRemaining: access.unlocksRemaining};
      }
      if (!access.unlimited && access.unlocksRemaining <= 0) {
        throw new ApplicationError(403, "You have no CV unlocks remaining.");
      }

      const update: Record<string, any> = {
        unlockedCVs: admin.firestore.FieldValue.arrayUnion(cvId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (!access.unlimited) update.unlocksRemaining = admin.firestore.FieldValue.increment(-1);
      transaction.update(recruiterRef, update);
      return {
        alreadyUnlocked: false,
        unlocksRemaining: access.unlimited ? -1 : access.unlocksRemaining - 1,
      };
    });

    return json(200, origin, result, {"Cache-Control": "private, no-store"});
  } catch (error: any) {
    if (error instanceof ApplicationError) return json(error.statusCode, origin, {error: error.message});
    console.error("UNLOCK_TALENT_CV_ERROR", error instanceof Error ? error.message : "Unknown error");
    return json(500, origin, {error: "Could not unlock this CV. Please try again."});
  }
};
