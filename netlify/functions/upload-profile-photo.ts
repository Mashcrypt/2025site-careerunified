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

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

type PhotoType = "png" | "jpg" | "webp";

type UploadedPhoto = {
  filename: string;
  buffer: Buffer;
};

const CONTENT_TYPES: Record<PhotoType, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function detectPhotoType(buffer: Buffer): PhotoType | null {
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

function filenameType(filename: string): PhotoType | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (name.endsWith(".webp")) return "webp";
  return null;
}

function parseMultipart(event: any): Promise<UploadedPhoto> {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType?.includes("multipart/form-data")) {
      reject(new ApplicationError(400, "Expected a profile photo upload."));
      return;
    }

    let settled = false;
    let photo: UploadedPhoto | null = null;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const parser = Busboy({
      headers: {"content-type": contentType},
      limits: {files: 1, fileSize: MAX_PHOTO_BYTES},
    });

    parser.on("file", (_field, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        fail(new ApplicationError(413, "Profile photo size must be less than 2MB."));
        stream.resume();
      });
      stream.on("end", () => {
        if (settled || stream.truncated) return;
        photo = {
          filename: info.filename || "",
          buffer: Buffer.concat(chunks),
        };
      });
    });
    parser.on("error", fail);
    parser.on("finish", () => {
      if (settled) return;
      if (!photo?.buffer.length) {
        fail(new ApplicationError(400, "Choose a PNG, JPG, or WebP profile photo."));
        return;
      }
      settled = true;
      resolve(photo);
    });

    try {
      const input = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64")
        : Buffer.from(event.body || "", "binary");
      parser.end(input);
    } catch {
      fail(new ApplicationError(400, "The profile photo upload could not be read."));
    }
  });
}

function storageBucket(admin: ReturnType<typeof getAdmin>) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
  return {bucket: admin.storage().bucket(bucketName), bucketName};
}

function ownedPhotoPath(value: unknown, uid: string) {
  const path = String(value || "");
  return path.startsWith(`profile-photos/${uid}/`) ? path : "";
}

export const handler: Handler = async event => {
  const origin = event.headers.origin || event.headers.Origin;
  const headers = {
    ...corsHeaders(origin),
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 200, headers, body: ""};
  }
  if (!['POST', 'DELETE'].includes(event.httpMethod)) {
    return {
      ...json(405, origin, {error: "Method Not Allowed"}),
      headers: {...headers, "Content-Type": "application/json"},
    };
  }

  let uploadedPath = "";

  try {
    const admin = getAdmin();
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please log in to update your profile photo.");

    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please log in again.");
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "profile-photo-update",
      identifier: `uid:${decoded.uid}`,
      limit: 12,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {
          error: "Too many profile photo changes. Please try again later.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    const userRef = admin.firestore().doc(`users/${decoded.uid}`);
    const userSnap = await userRef.get();
    const previousPath = ownedPhotoPath(userSnap.data()?.profilePhotoPath, decoded.uid);
    const {bucket, bucketName} = storageBucket(admin);

    if (event.httpMethod === "DELETE") {
      await userRef.set(
        {
          profilePhotoURL: admin.firestore.FieldValue.delete(),
          profilePhotoPath: admin.firestore.FieldValue.delete(),
          profilePhotoUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      if (previousPath) {
        await bucket.file(previousPath).delete({ignoreNotFound: true}).catch(() => undefined);
      }
      await admin.auth().updateUser(decoded.uid, {photoURL: null}).catch((error: unknown) => {
        console.error(
          "PROFILE_PHOTO_AUTH_SYNC_ERROR",
          error instanceof Error ? error.message : "Unknown Firebase Auth error",
        );
      });
      return json(200, origin, {removed: true});
    }

    const upload = await parseMultipart(event);
    const detectedType = detectPhotoType(upload.buffer);
    const extensionType = filenameType(upload.filename);
    if (!detectedType || !extensionType || detectedType !== extensionType) {
      throw new ApplicationError(400, "Choose a valid PNG, JPG, or WebP image.");
    }

    const storagePath =
      `profile-photos/${decoded.uid}/profile-${Date.now()}-${randomUUID()}.${detectedType}`;
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
          validatedBy: "upload-profile-photo",
        },
      },
    });

    const profilePhotoURL = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
      bucketName,
    )}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(downloadToken)}`;

    await userRef.set(
      {
        profilePhotoURL,
        profilePhotoPath: storagePath,
        profilePhotoUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    uploadedPath = "";

    await admin.auth().updateUser(decoded.uid, {photoURL: profilePhotoURL}).catch((error: unknown) => {
      console.error(
        "PROFILE_PHOTO_AUTH_SYNC_ERROR",
        error instanceof Error ? error.message : "Unknown Firebase Auth error",
      );
    });

    if (previousPath && previousPath !== storagePath) {
      await bucket.file(previousPath).delete({ignoreNotFound: true}).catch(() => undefined);
    }

    return json(200, origin, {
      profilePhotoURL,
      profilePhotoPath: storagePath,
      contentType: CONTENT_TYPES[detectedType],
      size: upload.buffer.length,
    });
  } catch (error: any) {
    if (uploadedPath) {
      try {
        const admin = getAdmin();
        const {bucket} = storageBucket(admin);
        await bucket.file(uploadedPath).delete({ignoreNotFound: true});
      } catch {
        // Cleanup is best-effort and never exposes storage details.
      }
    }
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }
    console.error("UPLOAD_PROFILE_PHOTO_ERROR", error);
    return json(500, origin, {error: "Could not update the profile photo. Please try again."});
  }
};
