import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {
  ApplicationError,
  bearerToken,
  cleanMultiline,
  cleanText,
  corsHeaders,
  json,
} from "./_applicationUtils";

function timestampValue(value: any) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

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

    const applicationId = cleanText(event.queryStringParameters?.applicationId, 180);
    const db = admin.firestore();
    const isAdmin = decoded.admin === true;
    let messagesQuery: any;

    if (applicationId) {
      const applicationSnap = await db.doc(`applications/${applicationId}`).get();
      if (!applicationSnap.exists) throw new ApplicationError(404, "Application not found.");
      const application = applicationSnap.data() || {};
      const canRead = isAdmin
        || application.candidateId === decoded.uid
        || (decoded.recruiter === true && application.recruiterId === decoded.uid);
      if (!canRead) throw new ApplicationError(403, "You do not have access to this application.");
      messagesQuery = db.collection("applicationMessages").where("applicationId", "==", applicationId);
    } else {
      if (decoded.recruiter === true || isAdmin) {
        throw new ApplicationError(400, "Application ID is required for recruiter access.");
      }
      messagesQuery = db.collection("applicationMessages").where("candidateId", "==", decoded.uid);
    }

    const snapshot = await messagesQuery.get();
    const messages = snapshot.docs
      .map((message: any) => ({id: message.id, ...message.data()}))
      .filter((message: any) => message.status === "sent")
      .map((message: any) => ({
        id: message.id,
        applicationId: cleanText(message.applicationId, 180),
        status: "sent",
        type: cleanText(message.type, 40),
        subject: cleanText(message.subject, 180),
        body: cleanMultiline(message.body, 5000),
        senderName: cleanText(message.senderName, 160),
        createdAt: timestampValue(message.createdAt),
        sentAt: timestampValue(message.sentAt),
      }))
      .sort((left: any, right: any) =>
        new Date(right.sentAt || right.createdAt || 0).getTime()
        - new Date(left.sentAt || left.createdAt || 0).getTime(),
      );

    return json(200, origin, {messages});
  } catch (error: any) {
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }
    console.error("GET_APPLICATION_MESSAGES_ERROR", error);
    return json(500, origin, {error: "Could not load application messages. Please try again."});
  }
};
