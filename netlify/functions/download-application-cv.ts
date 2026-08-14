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
} from "./_applicationUtils";

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 200, headers: corsHeaders(origin), body: ""};
  }
  if (event.httpMethod !== "GET") {
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

    const applicationId = cleanText(event.queryStringParameters?.id, 180);
    if (!applicationId) throw new ApplicationError(400, "Application ID is required.");

    const applicationSnap = await admin.firestore().doc(`applications/${applicationId}`).get();
    if (!applicationSnap.exists) throw new ApplicationError(404, "Application not found.");
    const application = applicationSnap.data() || {};

    const allowed =
      decoded.admin === true ||
      application.candidateId === decoded.uid ||
      (decoded.recruiter === true && application.recruiterId === decoded.uid);
    if (!allowed) throw new ApplicationError(403, "You do not have access to this CV.");

    const blobKey = cleanText(application.cvSnapshot?.blobKey, 800);
    const path = cleanText(application.cvSnapshot?.storagePath, 800);
    let buffer: Buffer;
    if (blobKey.startsWith("applications/")) {
      const stored = await readPrivateCv(blobKey);
      if (!stored) throw new ApplicationError(404, "Application CV not found.");
      buffer = stored;
    } else {
      if (!path.startsWith("applications/")) throw new ApplicationError(404, "Application CV not found.");
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
      [buffer] = await admin.storage().bucket(bucketName).file(path).download();
    }
    const fileName = safeFilename(application.cvSnapshot?.fileName);
    const contentType = cleanText(application.cvSnapshot?.contentType, 120) || "application/octet-stream";
    const disposition = event.queryStringParameters?.download === "1" ? "attachment" : "inline";

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
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }
    console.error("DOWNLOAD_APPLICATION_CV_ERROR", error);
    return json(500, origin, {error: "Could not open this CV. Please try again."});
  }
};
