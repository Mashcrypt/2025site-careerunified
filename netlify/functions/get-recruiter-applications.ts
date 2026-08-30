import type {Handler} from "@netlify/functions";
import crypto from "crypto";
import {getAdmin} from "./_firebaseAdmin";
import {checkRateLimit} from "./_rateLimit";
import {
  ApplicationError,
  bearerToken,
  corsHeaders,
  json,
} from "./_applicationUtils";

const MAX_APPLICATIONS = 500;

function clientValue(value: any): any {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(clientValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clientValue(item)]),
    );
  }
  return value;
}

function recruiterApplication(applicationSnap: any) {
  const application = clientValue(applicationSnap.data() || {});
  const cvSnapshot = application.cvSnapshot && typeof application.cvSnapshot === "object"
    ? {...application.cvSnapshot}
    : {};

  delete cvSnapshot.blobKey;
  delete cvSnapshot.storagePath;

  return {
    ...application,
    id: applicationSnap.id,
    cvSnapshot,
  };
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 204, headers: corsHeaders(origin), body: ""};
  }
  if (event.httpMethod !== "GET") {
    return json(405, origin, {error: "Method Not Allowed"});
  }

  try {
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please log in to view applications.");

    const admin = getAdmin();
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
      action: "recruiter-applications-list",
      identifier: `uid:${decoded.uid}`,
      limit: 60,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {
          error: "Too many application refreshes. Please try again shortly.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    const snapshot = await admin.firestore()
      .collection("applications")
      .where("recruiterId", "==", decoded.uid)
      .limit(MAX_APPLICATIONS)
      .get();

    const applications = snapshot.docs
      .map(recruiterApplication)
      .sort((left: any, right: any) => {
        const leftTime = Date.parse(left.submittedAt || "") || 0;
        const rightTime = Date.parse(right.submittedAt || "") || 0;
        return rightTime - leftTime;
      });

    return json(
      200,
      origin,
      {applications},
      {"Cache-Control": "private, no-store"},
    );
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }

    const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
    console.error("GET_RECRUITER_APPLICATIONS_ERROR", {reference, error});
    return json(500, origin, {
      error: "Applications could not be loaded. Please refresh and try again.",
      reference,
    });
  }
};
