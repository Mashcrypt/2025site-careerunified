import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit } from "./_rateLimit";
import {
  ApplicationError,
  bearerToken,
  cleanText,
  corsHeaders,
  json,
} from "./_applicationUtils";

const MAX_CV_CHOICES = 50;
const EMPLOYMENT_EQUITY_OPTIONS = new Set([
  "Black African",
  "Coloured",
  "Indian or Asian",
  "White",
  "Other",
]);
const OFFICIAL_SOUTH_AFRICAN_LANGUAGES = new Set([
  "Afrikaans",
  "English",
  "isiNdebele",
  "isiXhosa",
  "isiZulu",
  "Sepedi",
  "Sesotho",
  "Setswana",
  "siSwati",
  "Tshivenda",
  "Xitsonga",
  "South African Sign Language (SASL)",
]);

function homeLanguages(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(
    values
      .map((language) => cleanText(language, 80))
      .filter((language) => OFFICIAL_SOUTH_AFRICAN_LANGUAGES.has(language)),
  )].slice(0, OFFICIAL_SOUTH_AFRICAN_LANGUAGES.size);
}

function employmentEquitySelfIdentification(value: unknown) {
  const selection = cleanText(value, 80);
  return EMPLOYMENT_EQUITY_OPTIONS.has(selection) ? selection : "";
}

function timestampValue(value: any) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  if (typeof value === "string") return value;
  return "";
}

function applicationIdFor(jobId: string, candidateId: string) {
  return crypto.createHash("sha256").update(`${jobId}:${candidateId}`).digest("hex").slice(0, 48);
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
    if (!token) throw new ApplicationError(401, "Please log in before applying.");

    const admin = getAdmin();
    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please log in again.");
    }

    const jobId = cleanText(event.queryStringParameters?.jobId, 160);
    if (!jobId) throw new ApplicationError(400, "A valid job is required.");

    const db = admin.firestore();
    const rateLimit = await checkRateLimit({
      admin,
      action: "direct-application-context",
      identifier: decoded.uid,
      limit: 60,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        { error: "Too many application page requests. Please try again shortly." },
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }

    const applicationId = applicationIdFor(jobId, decoded.uid);
    const [profileSnap, cvsSnap, applicationSnap] = await Promise.all([
      db.doc(`users/${decoded.uid}`).get(),
      db.collection("cvs").where("userId", "==", decoded.uid).limit(MAX_CV_CHOICES).get(),
      db.doc(`applications/${applicationId}`).get(),
    ]);

    const profileData = profileSnap.exists ? profileSnap.data() || {} : {};
    const profile = {
      name: cleanText(profileData.name, 120),
      email: cleanText(profileData.email, 180),
      phone: cleanText(profileData.phone, 40),
      location: cleanText(profileData.location, 160),
      degreeType: cleanText(profileData.degreeType || profileData.highestQualification, 160),
      highestQualification: cleanText(profileData.highestQualification, 160),
      homeLanguages: homeLanguages(profileData.homeLanguages),
      ethnicity: employmentEquitySelfIdentification(profileData.ethnicity),
    };

    const cvs = cvsSnap.docs.map((cvSnap) => {
      const cv = cvSnap.data() || {};
      return {
        id: cvSnap.id,
        cvFileName: cleanText(cv.cvFileName, 160),
        status: cleanText(cv.status || "active", 40),
        uploadedAt: timestampValue(cv.uploadedAt),
      };
    });

    const existingData = applicationSnap.exists ? applicationSnap.data() || {} : null;
    const existingApplication = existingData
      ? { id: applicationSnap.id, status: cleanText(existingData.status || "submitted", 40) }
      : null;

    return json(
      200,
      origin,
      { profile, cvs, existingApplication },
      { "Cache-Control": "private, no-store" },
    );
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, { error: error.message });
    }
    console.error("GET_DIRECT_APPLICATION_CONTEXT_ERROR", error);
    return json(500, origin, { error: "Could not prepare this application. Please try again." });
  }
};
