import type {Handler} from "@netlify/functions";
import Busboy from "busboy";
import crypto from "crypto";
import {getAdmin} from "./_firebaseAdmin";
import {savePrivateCv, deletePrivateCv} from "./_privateCvStore";
import {checkRateLimit} from "./_rateLimit";
import {
  ApplicationError,
  bearerToken,
  cleanText,
  corsHeaders,
  json,
  safeFilename,
} from "./_applicationUtils";
import {
  APPLICATION_DOCUMENT_MAX_BYTES,
  applicationDocumentFileType,
  normalizeApplicationDocuments,
} from "./_applicationDocuments";

type ParsedFile = {filename: string; buffer: Buffer};

function parseMultipart(event: any): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let file: ParsedFile | null = null;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType?.toLowerCase().includes("multipart/form-data")) {
      fail(new ApplicationError(400, "Expected a document file upload."));
      return;
    }

    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: {"content-type": contentType},
        limits: {fileSize: APPLICATION_DOCUMENT_MAX_BYTES, files: 1, fields: 0},
      });
    } catch {
      fail(new ApplicationError(400, "The document upload could not be read."));
      return;
    }

    parser.on("file", (fieldName, stream, info) => {
      if (fieldName !== "document") {
        fail(new ApplicationError(400, "Upload one document at a time."));
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > APPLICATION_DOCUMENT_MAX_BYTES) {
          chunks.length = 0;
          fail(new ApplicationError(413, "Each requested document must be 5 MB or smaller."));
          stream.resume();
          return;
        }
        chunks.push(chunk);
      });
      stream.on("limit", () => {
        chunks.length = 0;
        fail(new ApplicationError(413, "Each requested document must be 5 MB or smaller."));
        stream.resume();
      });
      stream.on("end", () => {
        if (settled || stream.truncated) return;
        file = {filename: info.filename || "", buffer: Buffer.concat(chunks)};
      });
    });
    parser.on("error", fail);
    parser.on("finish", () => {
      if (settled) return;
      if (!file) {
        fail(new ApplicationError(400, "Choose a document to upload."));
        return;
      }
      settled = true;
      resolve(file);
    });
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");
    parser.end(body);
  });
}

function isActiveJob(job: Record<string, any>) {
  const status = cleanText(job.status || "active").toLowerCase();
  if (job.draft || ["draft", "closed", "removed", "deleted", "rejected"].includes(status)) return false;
  if (!job.deadline) return true;
  const deadline = new Date(job.deadline);
  if (Number.isNaN(deadline.getTime())) return true;
  deadline.setHours(23, 59, 59, 999);
  return deadline.getTime() >= Date.now();
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") return {statusCode: 200, headers: corsHeaders(origin), body: ""};
  if (event.httpMethod !== "POST") return json(405, origin, {error: "Method Not Allowed"});

  let uploadedBlobKey = "";
  try {
    const admin = getAdmin();
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please log in before uploading a document.");

    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please log in again.");
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "application-document-upload",
      identifier: `uid:${decoded.uid}`,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(429, origin, {
        error: "Too many document uploads. Please try again later.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      }, {"Retry-After": String(rateLimit.retryAfterSeconds)});
    }

    const jobId = cleanText(event.queryStringParameters?.jobId, 160);
    const documentId = cleanText(event.queryStringParameters?.documentId, 80);
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(jobId) || !/^[A-Za-z0-9_-]{1,80}$/.test(documentId)) {
      throw new ApplicationError(400, "A valid job and document request are required.");
    }

    const db = admin.firestore();
    const jobSnap = await db.doc(`jobs/${jobId}`).get();
    if (!jobSnap.exists) throw new ApplicationError(404, "This job is no longer available.");
    const job = jobSnap.data() || {};
    if (!isActiveJob(job) || cleanText(job.applicationMethod).toLowerCase() !== "direct") {
      throw new ApplicationError(410, "This job is not accepting document uploads.");
    }
    const request = normalizeApplicationDocuments(job.applicationDocuments)
      .find((item) => item.id === documentId);
    if (!request) throw new ApplicationError(403, "This document was not requested for the selected job.");

    const applicationId = crypto.createHash("sha256").update(`${jobId}:${decoded.uid}`).digest("hex").slice(0, 48);
    if ((await db.doc(`applications/${applicationId}`).get()).exists) {
      throw new ApplicationError(409, "You have already submitted an application for this job.");
    }

    const uploaded = await parseMultipart(event);
    const detectedType = applicationDocumentFileType(uploaded.filename, uploaded.buffer);
    if (!detectedType) {
      throw new ApplicationError(400, "Upload a valid PDF, DOCX, JPG, or PNG file.");
    }
    const fileName = safeFilename(uploaded.filename);
    const uploadId = crypto.randomUUID();
    const recruiterId = cleanText(job.recruiterId, 160);
    if (!recruiterId) throw new ApplicationError(400, "This job is missing recruiter information.");
    uploadedBlobKey = `application-staging/${recruiterId}/${jobId}/${decoded.uid}/${uploadId}`;

    await savePrivateCv(uploadedBlobKey, uploaded.buffer, {
      candidateId: decoded.uid,
      recruiterId,
      jobId,
      documentId,
      contentType: detectedType.contentType,
      fileName,
      size: uploaded.buffer.length,
      validatedBy: "upload-application-document",
    });

    try {
      await db.doc(`applicationDocumentUploads/${uploadId}`).create({
        uploadId,
        candidateId: decoded.uid,
        recruiterId,
        jobId,
        documentId,
        label: request.label,
        fileName,
        contentType: detectedType.contentType,
        size: uploaded.buffer.length,
        blobKey: uploadedBlobKey,
        status: "staged",
        createdAt: admin.firestore.Timestamp.now(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 48 * 60 * 60 * 1000),
      });
    } catch (error) {
      await deletePrivateCv(uploadedBlobKey).catch(() => undefined);
      uploadedBlobKey = "";
      throw error;
    }

    return json(201, origin, {uploadId, documentId, label: request.label, fileName, size: uploaded.buffer.length});
  } catch (error: any) {
    if (uploadedBlobKey) await deletePrivateCv(uploadedBlobKey).catch(() => undefined);
    if (error instanceof ApplicationError) return json(error.statusCode, origin, {error: error.message});
    console.error("UPLOAD_APPLICATION_DOCUMENT_ERROR", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return json(500, origin, {error: "Could not securely upload this document. Please try again."});
  }
};
