import type {Handler} from "@netlify/functions";
import Busboy from "busboy";
import {randomUUID} from "crypto";
import {getAdmin} from "./_firebaseAdmin";
import {checkRateLimit} from "./_rateLimit";
import {
  ApplicationError,
  bearerToken,
  corsHeaders,
  json,
} from "./_applicationUtils";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MIN_LOGO_WIDTH = 400;
const MIN_LOGO_HEIGHT = 200;

type LogoType = "png" | "jpg" | "webp";

type UploadedLogo = {
  filename: string;
  buffer: Buffer;
};

type ImageDimensions = {
  width: number;
  height: number;
};

const CONTENT_TYPES: Record<LogoType, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function detectLogoType(buffer: Buffer): LogoType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return "png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function filenameType(filename: string): LogoType | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (name.endsWith(".webp")) return "webp";
  return null;
}

function jpegDimensions(buffer: Buffer): ImageDimensions | null {
  let offset = 2;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);

  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda || offset + 1 >= buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(buffer: Buffer): ImageDimensions | null {
  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
    };
  }
  return null;
}

function imageDimensions(buffer: Buffer, type: LogoType): ImageDimensions | null {
  if (type === "png") {
    if (buffer.length < 24) return null;
    return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
  }
  if (type === "jpg") return jpegDimensions(buffer);
  return webpDimensions(buffer);
}

function parseMultipart(event: any): Promise<UploadedLogo> {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType?.includes("multipart/form-data")) {
      reject(new ApplicationError(400, "Expected a logo image upload."));
      return;
    }

    let settled = false;
    let logo: UploadedLogo | null = null;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const parser = Busboy({
      headers: {"content-type": contentType},
      limits: {files: 1, fileSize: MAX_LOGO_BYTES},
    });

    parser.on("file", (_field, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        fail(new ApplicationError(413, "Logo file size must be less than 2MB."));
        stream.resume();
      });
      stream.on("end", () => {
        if (settled || stream.truncated) return;
        logo = {
          filename: info.filename || "",
          buffer: Buffer.concat(chunks),
        };
      });
    });
    parser.on("error", fail);
    parser.on("finish", () => {
      if (settled) return;
      if (!logo?.buffer.length) {
        fail(new ApplicationError(400, "Choose a PNG, JPG, or WebP logo."));
        return;
      }
      settled = true;
      resolve(logo);
    });

    try {
      const input = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64")
        : Buffer.from(event.body || "", "binary");
      parser.end(input);
    } catch {
      fail(new ApplicationError(400, "The logo upload could not be read."));
    }
  });
}

async function syncLogoToJobs(admin: ReturnType<typeof getAdmin>, recruiterId: string, logo: string) {
  const jobs = await admin.firestore()
    .collection("jobs")
    .where("recruiterId", "==", recruiterId)
    .get();

  const documents = jobs.docs;
  for (let start = 0; start < documents.length; start += 400) {
    const batch = admin.firestore().batch();
    documents.slice(start, start + 400).forEach(job => {
      batch.update(job.ref, {
        logo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
  return documents.length;
}

export const handler: Handler = async event => {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 200, headers: corsHeaders(origin), body: ""};
  }
  if (event.httpMethod !== "POST") {
    return json(405, origin, {error: "Method Not Allowed"});
  }

  let uploadedPath = "";

  try {
    const admin = getAdmin();
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please log in as a recruiter.");

    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please log in again.");
    }
    if (decoded.recruiter !== true) {
      throw new ApplicationError(403, "Recruiter access is required.");
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "recruiter-logo-upload",
      identifier: `uid:${decoded.uid}`,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {
          error: "Too many logo uploads. Please try again later.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    const upload = await parseMultipart(event);
    const detectedType = detectLogoType(upload.buffer);
    const extensionType = filenameType(upload.filename);
    if (!detectedType || !extensionType || detectedType !== extensionType) {
      throw new ApplicationError(400, "Choose a valid PNG, JPG, or WebP image.");
    }

    const dimensions = imageDimensions(upload.buffer, detectedType);
    if (!dimensions) {
      throw new ApplicationError(400, "The company logo dimensions could not be verified.");
    }
    if (dimensions.width < MIN_LOGO_WIDTH || dimensions.height < MIN_LOGO_HEIGHT) {
      throw new ApplicationError(
        400,
        `The company logo must be at least ${MIN_LOGO_WIDTH} x ${MIN_LOGO_HEIGHT} pixels.`,
      );
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
    const bucket = admin.storage().bucket(bucketName);
    const storagePath =
      `company-logos/${decoded.uid}/company-logo-${Date.now()}-${randomUUID()}.${detectedType}`;
    const downloadToken = randomUUID();
    uploadedPath = storagePath;

    await bucket.file(storagePath).save(upload.buffer, {
      resumable: false,
      metadata: {
        contentType: CONTENT_TYPES[detectedType],
        cacheControl: "public, max-age=31536000, immutable",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          ownerUid: decoded.uid,
          validatedBy: "upload-recruiter-logo",
        },
      },
    });

    const logoUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
      bucketName,
    )}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
    const recruiterRef = admin.firestore().doc(`recruiters/${decoded.uid}`);
    const recruiterSnapshot = await recruiterRef.get();
    const recruiter = recruiterSnapshot.data() || {};
    const previousProfile =
      recruiter.companyProfile && typeof recruiter.companyProfile === "object"
        ? recruiter.companyProfile
        : {};
    const previousPath = String(previousProfile.logoPath || "");
    const version = new Date().toISOString();

    await recruiterRef.set(
      {
        companyProfile: {
          ...previousProfile,
          logo: logoUrl,
          logoPath: storagePath,
        },
        companyProfileVersion: version,
        companyProfileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    uploadedPath = "";
    let syncedJobs = 0;
    let syncComplete = true;
    try {
      syncedJobs = await syncLogoToJobs(admin, decoded.uid, logoUrl);
    } catch (syncError: any) {
      syncComplete = false;
      console.error(
        "RECRUITER_LOGO_JOB_SYNC_ERROR",
        syncError instanceof Error ? syncError.message : "Unknown job sync error",
      );
    }

    if (
      syncComplete &&
      previousPath &&
      previousPath !== storagePath &&
      previousPath.startsWith(`company-logos/${decoded.uid}/`)
    ) {
      await bucket.file(previousPath).delete({ignoreNotFound: true}).catch(() => undefined);
    }

    return json(200, origin, {
      logoUrl,
      logoPath: storagePath,
      contentType: CONTENT_TYPES[detectedType],
      size: upload.buffer.length,
      width: dimensions.width,
      height: dimensions.height,
      companyProfileVersion: version,
      syncedJobs,
      syncComplete,
    });
  } catch (error: any) {
    if (uploadedPath) {
      try {
        const admin = getAdmin();
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
        await admin.storage().bucket(bucketName).file(uploadedPath).delete({ignoreNotFound: true});
      } catch {
        // Cleanup is best-effort and never exposes storage details.
      }
    }
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }
    console.error("UPLOAD_RECRUITER_LOGO_ERROR", error);
    return json(500, origin, {error: "Could not upload the company logo. Please try again."});
  }
};
