import type { Handler } from "@netlify/functions";
import Busboy from "busboy";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit, clientIpFromHeaders } from "./_rateLimit";

type ParsedFile = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 50000;

class PublicError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

type DetectedResumeType = "pdf" | "docx";

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions?/gi,
  /disregard\s+(?:all\s+)?previous\s+instructions?/gi,
  /forget\s+(?:all\s+)?previous\s+instructions?/gi,
  /override\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/gi,
  /reveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/gi,
  /print\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/gi,
  /do\s+not\s+follow\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/gi,
  /prompt\s*injection/gi,
  /jailbreak/gi,
];

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

function detectResumeType(buffer: Buffer): DetectedResumeType | null {
  if (buffer.length < 4) return null;

  const signature = buffer.subarray(0, 4).toString("hex").toLowerCase();
  if (signature === "25504446") return "pdf";
  if (signature === "504b0304") return "docx";
  return null;
}

function extensionFromFilename(filename: string): DetectedResumeType | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

function sanitizeExtractedText(value: string) {
  let sanitized = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\?(?:php)?[\s\S]*?\?>/gi, "")
    .replace(/<[^>]+>/g, "");

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }

  return sanitized
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_CHARS);
}

function json(statusCode: number, origin: string | undefined, body: any, extraHeaders?: Record<string, string>) {
  return {
    statusCode,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", ...(extraHeaders || {}) },
    body: JSON.stringify(body),
  };
}

function parseMultipart(event: any): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return fail(new PublicError(400, "Expected multipart/form-data."));
    }

    const bb = Busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    });
    let file: ParsedFile | null = null;

    bb.on("file", (_fieldname, stream, info) => {
      const { filename, mimeType } = info;
      const chunks: Buffer[] = [];
      let size = 0;

      stream.on("data", (d: Buffer) => {
        size += d.length;
        if (size > MAX_UPLOAD_BYTES) {
          chunks.length = 0;
          fail(new PublicError(413, "File size must be less than 5MB."));
          stream.resume();
          return;
        }
        chunks.push(d);
      });
      stream.on("limit", () => {
        chunks.length = 0;
        fail(new PublicError(413, "File size must be less than 5MB."));
        stream.resume();
      });
      stream.on("end", () => {
        if (settled || stream.truncated) return;
        file = { filename, mimeType, buffer: Buffer.concat(chunks) };
      });
    });

    bb.on("error", fail);
    bb.on("finish", () => {
      if (settled) return;
      if (!file) return fail(new PublicError(400, "No file uploaded."));
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
    let identifier = `ip:${clientIpFromHeaders(event.headers as Record<string, string | undefined>)}`;

    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        identifier = `uid:${decoded.uid}`;
      } catch {
        return json(401, origin, { error: "Invalid or expired token" });
      }
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "resume-text-extraction",
      identifier,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {
          error: "Too many resume imports. Please try again later.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { "Retry-After": String(rateLimit.retryAfterSeconds) }
      );
    }

    const uploaded = await parseMultipart(event);
    const detectedType = detectResumeType(uploaded.buffer);
    if (!detectedType) {
      return json(400, origin, {
        error: "Only PDF or DOCX is supported. Please upload a .pdf or .docx file.",
      });
    }

    const extensionType = extensionFromFilename(uploaded.filename || "");
    if (!extensionType || extensionType !== detectedType) {
      return json(400, origin, {
        error: "The file extension does not match the uploaded file type.",
      });
    }

    let text = "";
    if (detectedType === "pdf") {
      const result = await pdf(uploaded.buffer);
      text = result.text || "";
    } else {
      const result = await mammoth.extractRawText({ buffer: uploaded.buffer });
      text = result.value || "";
    }

    text = sanitizeExtractedText(text);

    if (!text || text.length < 30) {
      return json(422, origin, {
        error: "We could not extract enough readable text from that file. Try a different PDF/DOCX (non-scanned).",
      });
    }

    return json(200, origin, { text });
  } catch (err: any) {
    if (err instanceof PublicError) {
      return json(err.statusCode, origin, { error: err.message });
    }

    return json(500, origin, { error: "Extraction failed. Please try again with a different PDF or DOCX file." });
  }
};
