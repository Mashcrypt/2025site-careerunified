import type { Handler } from "@netlify/functions";
import Busboy from "busboy";
import { randomUUID } from "crypto";
import { getAdmin } from "./_firebaseAdmin";
import {deletePrivateCv, savePrivateCv} from "./_privateCvStore";
import { checkRateLimit } from "./_rateLimit";

type ParsedFile = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

type ResumeType = "pdf" | "docx";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES: Record<ResumeType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

class PublicError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function corsHeaders(origin?: string) {
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin":
      allowed === "*"
        ? "*"
        : origin && origin === allowed
        ? origin
        : allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(statusCode: number, origin: string | undefined, body: any, extraHeaders?: Record<string, string>) {
  return {
    statusCode,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", ...(extraHeaders || {}) },
    body: JSON.stringify(body),
  };
}

function safeText(value: unknown, maxLength = 120) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\?(?:php)?[\s\S]*?\?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeFilename(filename: string, type: ResumeType) {
  const fallback = `cv.${type}`;
  const cleaned = safeText(filename, 160)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || fallback;
}

function detectResumeType(buffer: Buffer): ResumeType | null {
  if (buffer.length < 4) return null;
  const signature = buffer.subarray(0, 4).toString("hex").toLowerCase();
  if (signature === "25504446") return "pdf";
  if (signature === "504b0304") return "docx";
  return null;
}

function extensionFromFilename(filename: string): ResumeType | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

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
    if (!contentType || !contentType.includes("multipart/form-data")) {
      fail(new PublicError(400, "Expected multipart/form-data."));
      return;
    }

    const bb = Busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    });

    bb.on("file", (_fieldname, stream, info) => {
      const chunks: Buffer[] = [];
      let size = 0;

      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_UPLOAD_BYTES) {
          chunks.length = 0;
          fail(new PublicError(413, "File size must be less than 5MB."));
          stream.resume();
          return;
        }
        chunks.push(chunk);
      });

      stream.on("limit", () => {
        chunks.length = 0;
        fail(new PublicError(413, "File size must be less than 5MB."));
        stream.resume();
      });

      stream.on("end", () => {
        if (settled || stream.truncated) return;
        file = {
          filename: info.filename || "",
          mimeType: info.mimeType || "",
          buffer: Buffer.concat(chunks),
        };
      });
    });

    bb.on("error", fail);
    bb.on("finish", () => {
      if (settled) return;
      if (!file) {
        fail(new PublicError(400, "No file uploaded."));
        return;
      }
      settled = true;
      resolve(file);
    });

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");

    bb.end(body);
  });
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(origin), body: "Method Not Allowed" };
  }

  try {
    const admin = getAdmin();
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return json(401, origin, { error: "Missing Authorization Bearer token" });

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch {
      return json(401, origin, { error: "Invalid or expired token" });
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "profile-cv-upload",
      identifier: `uid:${decoded.uid}`,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {
          error: "Too many CV uploads. Please try again later.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { "Retry-After": String(rateLimit.retryAfterSeconds) }
      );
    }

    const uploaded = await parseMultipart(event);
    const detectedType = detectResumeType(uploaded.buffer);
    if (!detectedType) {
      return json(400, origin, { error: "Only PDF or DOCX files are allowed." });
    }

    const extensionType = extensionFromFilename(uploaded.filename);
    if (!extensionType || extensionType !== detectedType) {
      return json(400, origin, { error: "The file extension does not match the uploaded file type." });
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
    const bucket = admin.storage().bucket(bucketName);
    const now = Date.now();
    const cleanName = safeFilename(uploaded.filename, detectedType);
    let storagePath = `cvs/${decoded.uid}/${now}_${cleanName}`;
    let blobKey = "";
    let storageProvider: "firebase" | "netlify_blobs" = "firebase";
    const downloadToken = randomUUID();
    const contentType = ALLOWED_CONTENT_TYPES[detectedType];

    try {
      await bucket.file(storagePath).save(uploaded.buffer, {
        resumable: false,
        metadata: {
          contentType,
          cacheControl: "private, max-age=0, no-store",
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            ownerUid: decoded.uid,
            validatedBy: "upload-profile-cv",
          },
        },
      });
    } catch {
      storageProvider = "netlify_blobs";
      storagePath = "";
      blobKey = `profiles/${decoded.uid}/${now}_${randomUUID()}`;
      try {
        await savePrivateCv(blobKey, uploaded.buffer, {
          ownerUid: decoded.uid,
          contentType,
          fileName: cleanName,
          size: uploaded.buffer.length,
          validatedBy: "upload-profile-cv",
        });
      } catch {
        throw new PublicError(503, "CV upload is temporarily unavailable. Please try again shortly.");
      }
    }

    const cvURL = storageProvider === "firebase"
      ? `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
          bucketName
        )}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(downloadToken)}`
      : "";
    const cvId = `${decoded.uid}_${now}`;
    const uploadedAt = new Date(now).toISOString();
    const fullName = safeText(decoded.name || decoded.email || "Anonymous User", 120) || "Anonymous User";

    try {
      await admin.firestore().doc(`cvs/${cvId}`).set({
        userId: decoded.uid,
        userEmail: decoded.email || "",
        fullName,
        cvURL,
        cvFileName: cleanName,
        cvFilePath: storagePath,
        blobKey,
        storageProvider,
        uploadedAt,
        status: "active",
        viewCount: 0,
        unlocked: false,
        contentType,
        size: uploaded.buffer.length,
        validated: true,
        validationMethod: "magic-bytes",
      });
    } catch (error) {
      if (storageProvider === "netlify_blobs") {
        await deletePrivateCv(blobKey).catch(() => undefined);
      } else {
        await bucket.file(storagePath).delete({ignoreNotFound: true}).catch(() => undefined);
      }
      throw error;
    }

    return json(200, origin, {
      id: cvId,
      cvURL,
      cvFileName: cleanName,
      cvFilePath: storagePath,
      blobKey,
      storageProvider,
      uploadedAt,
    });
  } catch (error: any) {
    if (error instanceof PublicError) {
      return json(error.statusCode, origin, { error: error.message });
    }

    return json(500, origin, { error: "CV upload could not be completed. Please try again shortly." });
  }
};
