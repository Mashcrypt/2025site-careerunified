import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {readPrivateCv} from "./_privateCvStore";
import {
  ApplicationError,
  bearerToken,
  cleanText,
  corsHeaders,
  json,
  safeFilename,
  storagePathFromCv,
} from "./_applicationUtils";
import {checkRateLimit} from "./_rateLimit";
import {recruiterTalentAccess} from "./_recruiterTalentAccess";

export const handler: Handler = async event => {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 200, headers: corsHeaders(origin), body: ""};
  }
  if (event.httpMethod !== "GET") return json(405, origin, {error: "Method Not Allowed"});

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

    const cvId = cleanText(event.queryStringParameters?.id, 180);
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(cvId)) {
      throw new ApplicationError(400, "A valid CV ID is required.");
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "talent-cv-download",
      identifier: `uid:${decoded.uid}`,
      limit: 60,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {error: "Too many CV downloads. Please try again later."},
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    const db = admin.firestore();
    const [recruiterSnapshot, cvSnapshot] = await Promise.all([
      db.doc(`recruiters/${decoded.uid}`).get(),
      db.doc(`cvs/${cvId}`).get(),
    ]);
    if (!cvSnapshot.exists || cvSnapshot.data()?.status === "inactive") {
      throw new ApplicationError(404, "This CV is no longer available.");
    }
    if (decoded.admin !== true) {
      if (!recruiterSnapshot.exists) throw new ApplicationError(403, "Recruiter profile not found.");
      const access = recruiterTalentAccess(recruiterSnapshot.data() || {});
      if (!access.active || !access.unlockedCVs.includes(cvId)) {
        throw new ApplicationError(403, "Unlock this CV before opening it.");
      }
    }

    const cv = cvSnapshot.data() || {};
    const blobKey = cleanText(cv.blobKey, 800);
    let buffer: Buffer;
    if (blobKey.startsWith("profiles/")) {
      const stored = await readPrivateCv(blobKey);
      if (!stored) throw new ApplicationError(404, "This CV file could not be found.");
      buffer = stored;
    } else {
      const storagePath = storagePathFromCv(cv);
      if (!storagePath.startsWith("cvs/")) throw new ApplicationError(404, "This CV file could not be found.");
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
      [buffer] = await admin.storage().bucket(bucketName).file(storagePath).download();
    }

    const fileName = safeFilename(cv.cvFileName);
    const storedContentType = cleanText(cv.contentType, 120);
    const allowedContentTypes = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    const contentType = allowedContentTypes.has(storedContentType)
      ? storedContentType
      : "application/octet-stream";
    const requestedDownload = event.queryStringParameters?.download === "1";
    const disposition = requestedDownload || contentType === "application/octet-stream"
      ? "attachment"
      : "inline";
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
      isBase64Encoded: true,
      body: buffer.toString("base64"),
    };
  } catch (error: any) {
    if (error instanceof ApplicationError) return json(error.statusCode, origin, {error: error.message});
    console.error("DOWNLOAD_TALENT_CV_ERROR", error instanceof Error ? error.message : "Unknown error");
    return json(500, origin, {error: "Could not open this CV. Please try again."});
  }
};
