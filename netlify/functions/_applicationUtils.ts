export class ApplicationError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function corsHeaders(origin?: string) {
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin":
      allowed === "*" ? "*" : origin && origin === allowed ? origin : allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

export function json(
  statusCode: number,
  origin: string | undefined,
  body: unknown,
  extraHeaders?: Record<string, string>,
) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };
}

export function parseJsonBody(event: any) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new ApplicationError(400, "Request body must be valid JSON.");
  }
}

export function bearerToken(event: any) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

export function cleanText(value: unknown, maxLength = 240) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function cleanMultiline(value: unknown, maxLength = 4000) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function safeFilename(value: unknown) {
  return cleanText(value, 160)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/^\.+/, "") || "Candidate-CV.pdf";
}

export function storagePathFromCv(cv: Record<string, any>) {
  const storedPath = cleanText(cv.cvFilePath, 600);
  if (storedPath.startsWith("cvs/")) return storedPath;

  const rawUrl = cleanText(cv.cvURL || cv.cvUrl, 1200);
  if (!rawUrl) return "";

  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname !== "firebasestorage.googleapis.com") return "";
    const encodedPath = parsed.pathname.split("/o/")[1];
    return encodedPath ? decodeURIComponent(encodedPath) : "";
  } catch {
    return "";
  }
}

export function normalizeAnswer(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 12);
  }
  return cleanMultiline(value, 1200);
}

export function hasAnswer(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : cleanText(value, 1200).length > 0;
}

