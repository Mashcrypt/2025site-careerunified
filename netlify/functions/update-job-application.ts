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

const RECRUITER_STATUSES = new Set([
  "viewed",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "unsuccessful",
]);

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

    if (isCandidateOwner && !isRecruiterOwner && requestedStatus !== "withdrawn") {
      throw new ApplicationError(403, "Candidates can only withdraw their own applications.");
    }
    if (isRecruiterOwner && requestedStatus && !RECRUITER_STATUSES.has(requestedStatus)) {
      throw new ApplicationError(400, "Select a valid application status.");
    }
    if (!requestedStatus && !note) {
      throw new ApplicationError(400, "A status or private note is required.");
    }

    const now = admin.firestore.Timestamp.now();
    if (requestedStatus) {
      await applicationRef.update({
        status: requestedStatus,
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: requestedStatus,
          at: now,
          actor: isRecruiterOwner || isAdmin ? "recruiter" : "candidate",
        }),
        ...(requestedStatus === "viewed" && !application.viewedAt ? {viewedAt: now} : {}),
        updatedAt: now,
      });
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

    return json(200, origin, {
      applicationId,
      status: requestedStatus || application.status,
      message: note && !requestedStatus ? "Private note saved." : "Application updated.",
    });
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }
    console.error("UPDATE_JOB_APPLICATION_ERROR", error);
    return json(500, origin, {error: "Could not update this application. Please try again."});
  }
};

