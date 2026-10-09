import type {Handler} from "@netlify/functions";
import Busboy from "busboy";
import {randomUUID} from "crypto";
import {getAdmin} from "./_firebaseAdmin";
import {checkRateLimit} from "./_rateLimit";
import {ApplicationError, bearerToken, corsHeaders, json} from "./_applicationUtils";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const CONTENT_TYPES = {png: "image/png", jpg: "image/jpeg", webp: "image/webp"} as const;
type ImageType = keyof typeof CONTENT_TYPES;

type UploadedImage = {filename: string; buffer: Buffer};

function detectImageType(buffer: Buffer): ImageType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

function filenameImageType(filename: string): ImageType | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (name.endsWith(".webp")) return "webp";
  return null;
}

function parseMultipart(event: any): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType?.includes("multipart/form-data")) {
      reject(new ApplicationError(400, "Choose an image to upload."));
      return;
    }

    let settled = false;
    let upload: UploadedImage | null = null;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const parser = Busboy({headers: {"content-type": contentType}, limits: {files: 1, fileSize: MAX_IMAGE_BYTES}});
    parser.on("file", (_field, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        fail(new ApplicationError(413, "Each image must be 4 MB or smaller."));
        stream.resume();
      });
      stream.on("end", () => {
        if (settled || stream.truncated) return;
        upload = {filename: info.filename || "", buffer: Buffer.concat(chunks)};
      });
    });
    parser.on("error", fail);
    parser.on("finish", () => {
      if (settled) return;
      if (!upload?.buffer.length) {
        fail(new ApplicationError(400, "Choose a PNG, JPG, or WebP image."));
        return;
      }
      settled = true;
      resolve(upload);
    });

    try {
      const input = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64")
        : Buffer.from(event.body || "", "binary");
      parser.end(input);
    } catch {
      fail(new ApplicationError(400, "The image upload could not be read."));
    }
  });
}

export const handler: Handler = async event => {
  const origin = event.headers.origin || event.headers.Origin;
  const headers = {...corsHeaders(origin), "Access-Control-Allow-Methods": "POST, OPTIONS"};
  if (event.httpMethod === "OPTIONS") return {statusCode: 200, headers, body: ""};
  if (event.httpMethod !== "POST") {
    return {...json(405, origin, {error: "Method Not Allowed"}), headers: {...headers, "Content-Type": "application/json"}};
  }

  let uploadedPath = "";
  try {
    const admin = getAdmin();
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please sign in to upload company photos.");

    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please sign in again.");
    }
    if (decoded.recruiter !== true) throw new ApplicationError(403, "Recruiter access only.");
    const companyId = String(decoded.companyId || decoded.uid || "");
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(companyId)) throw new ApplicationError(403, "Your company account could not be verified.");

    const rateLimit = await checkRateLimit({
      admin,
      action: "career-site-image-upload",
      identifier: `uid:${decoded.uid}`,
      limit: 100,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(429, origin, {error: "Too many image uploads. Please try again later.", retryAfterSeconds: rateLimit.retryAfterSeconds}, {"Retry-After": String(rateLimit.retryAfterSeconds)});
    }

    const image = await parseMultipart(event);
    const type = detectImageType(image.buffer);
    if (!type || filenameImageType(image.filename) !== type) {
      throw new ApplicationError(400, "Choose a valid PNG, JPG, or WebP image.");
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
    const bucket = admin.storage().bucket(bucketName);
    const storagePath = `career-site-media/${companyId}/gallery-${Date.now()}-${randomUUID()}.${type}`;
    const downloadToken = randomUUID();
    uploadedPath = storagePath;
    await bucket.file(storagePath).save(image.buffer, {
      resumable: false,
      metadata: {
        contentType: CONTENT_TYPES[type],
        cacheControl: "public, max-age=31536000, immutable",
        metadata: {firebaseStorageDownloadTokens: downloadToken, ownerUid: companyId, validatedBy: "upload-career-site-image"},
      },
    });

    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
    uploadedPath = "";
    return json(200, origin, {imageUrl, contentType: CONTENT_TYPES[type], size: image.buffer.length});
  } catch (error: any) {
    if (uploadedPath) {
      try {
        const admin = getAdmin();
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
        await admin.storage().bucket(bucketName).file(uploadedPath).delete({ignoreNotFound: true});
      } catch { /* Keep the original upload error. */ }
    }
    const status = error instanceof ApplicationError ? error.statusCode : 500;
    if (status === 500) console.error("CAREER_SITE_IMAGE_UPLOAD_ERROR", error instanceof Error ? error.name : "UnknownError");
    return json(status, origin, {error: error instanceof ApplicationError ? error.message : "Could not upload this company photo."});
  }
};
