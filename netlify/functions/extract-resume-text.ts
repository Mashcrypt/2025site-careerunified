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

function parseMultipart(event: any): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return reject(new Error("Expected multipart/form-data"));
    }

    const bb = Busboy({ headers: { "content-type": contentType } });
    let file: ParsedFile | null = null;

    bb.on("file", (_fieldname, stream, info) => {
      const { filename, mimeType } = info;
      const chunks: Buffer[] = [];

      stream.on("data", (d: Buffer) => chunks.push(d));
      stream.on("limit", () => reject(new Error("File too large")));
      stream.on("end", () => {
        file = { filename, mimeType, buffer: Buffer.concat(chunks) };
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => {
      if (!file) return reject(new Error("No file uploaded"));
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
    const name = (uploaded.filename || "").toLowerCase();
    const isPdf = uploaded.mimeType === "application/pdf" || name.endsWith(".pdf");
    const isDocx =
      uploaded.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx");

    if (!isPdf && !isDocx) {
      return json(400, origin, {
        error: "Only PDF or DOCX is supported. Please upload a .pdf or .docx file.",
      });
    }

    let text = "";
    if (isPdf) {
      const result = await pdf(uploaded.buffer);
      text = result.text || "";
    } else {
      const result = await mammoth.extractRawText({ buffer: uploaded.buffer });
      text = result.value || "";
    }

    text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();

    if (!text || text.length < 30) {
      return json(422, origin, {
        error: "We could not extract enough readable text from that file. Try a different PDF/DOCX (non-scanned).",
      });
    }

    return json(200, origin, { text });
  } catch (err: any) {
    return json(500, origin, { error: err?.message || "Extraction failed" });
  }
};
