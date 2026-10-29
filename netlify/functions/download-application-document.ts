import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {readPrivateCv} from "./_privateCvStore";
import {ApplicationError, bearerToken, cleanText, corsHeaders, json, safeFilename} from "./_applicationUtils";

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") return {statusCode: 200, headers: corsHeaders(origin), body: ""};
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

    const applicationId = cleanText(event.queryStringParameters?.id, 180);
    const documentId = cleanText(event.queryStringParameters?.documentId, 80);
    if (!applicationId || !documentId) throw new ApplicationError(400, "Application and document IDs are required.");

    const applicationSnap = await admin.firestore().doc(`applications/${applicationId}`).get();
    if (!applicationSnap.exists) throw new ApplicationError(404, "Application not found.");
    const application = applicationSnap.data() || {};
    const allowed = decoded.admin === true
      || application.candidateId === decoded.uid
      || (decoded.recruiter === true && application.recruiterId === (decoded.companyId || decoded.uid));
    if (!allowed) throw new ApplicationError(403, "You do not have access to this document.");

    const file = (Array.isArray(application.documents) ? application.documents : [])
      .find((item: any) => cleanText(item.documentId, 80) === documentId);
    if (!file) throw new ApplicationError(404, "Requested application document not found.");
    const key = cleanText(file.blobKey, 800);
    const expectedPrefix = `applications/${cleanText(application.recruiterId, 160)}/${cleanText(application.jobId, 160)}/${cleanText(application.candidateId, 160)}/${applicationId}_document_`;
    if (!key.startsWith(expectedPrefix)) throw new ApplicationError(404, "Requested application document not found.");
    const buffer = await readPrivateCv(key);
    if (!buffer) throw new ApplicationError(404, "Requested application document is no longer available.");

    const filename = safeFilename(file.fileName);
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": cleanText(file.contentType, 120) || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
      isBase64Encoded: true,
      body: buffer.toString("base64"),
    };
  } catch (error: any) {
    if (error instanceof ApplicationError) return json(error.statusCode, origin, {error: error.message});
    console.error("DOWNLOAD_APPLICATION_DOCUMENT_ERROR", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return json(500, origin, {error: "Could not download this document. Please try again."});
  }
};
