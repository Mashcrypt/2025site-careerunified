import type {Handler} from "@netlify/functions";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import {getAdmin} from "./_firebaseAdmin";
import {checkRateLimit, clientIpFromHeaders} from "./_rateLimit";

const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_HTML_LENGTH = 2 * 1024 * 1024;
const PDF_LIMIT = 12;
const PDF_WINDOW_SECONDS = 60 * 60;

function allowedOrigins() {
  const configured = [process.env.ALLOWED_ORIGIN, process.env.SITE_URL]
    .flatMap(value => String(value || "").split(","))
    .map(value => value.trim())
    .filter(Boolean);

  return new Set([
    "https://careerunified.com",
    "https://www.careerunified.com",
    "http://localhost:8888",
    "http://127.0.0.1:8888",
    ...configured,
  ]);
}

function corsHeaders(origin?: string) {
  const allowed = allowedOrigins();
  const responseOrigin = origin && allowed.has(origin) ? origin : "https://careerunified.com";
  return {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(
  statusCode: number,
  body: unknown,
  origin?: string,
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

function rawBody(event: Parameters<Handler>[0]) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
}

function bearerToken(event: Parameters<Handler>[0]) {
  const header = event.headers.authorization || event.headers.Authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function allowedAssetUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (["data:", "blob:", "about:"].includes(url.protocol)) return true;
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;

    const configuredHosts = [...allowedOrigins()].flatMap(origin => {
      try {
        return [new URL(origin).hostname];
      } catch {
        return [];
      }
    });
    const hosts = new Set([
      "careerunified.com",
      "www.careerunified.com",
      "firebasestorage.googleapis.com",
      "storage.googleapis.com",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      ...configuredHosts,
    ]);
    return hosts.has(url.hostname);
  } catch {
    return false;
  }
}

export const handler: Handler = async event => {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 204, headers: corsHeaders(origin), body: ""};
  }

  if (event.httpMethod !== "POST") {
    return json(405, {error: "Method not allowed"}, origin);
  }

  try {
    const body = rawBody(event);
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      return json(413, {error: "The CV preview is too large to export."}, origin);
    }

    let payload: {html?: string; fileName?: string};
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      return json(400, {error: "Request body must be valid JSON."}, origin);
    }

    if (!payload.html || typeof payload.html !== "string") {
      return json(400, {error: "Missing 'html' in request body."}, origin);
    }
    if (payload.html.length > MAX_HTML_LENGTH) {
      return json(413, {error: "The CV preview is too large to export."}, origin);
    }

    const admin = getAdmin();
    const token = bearerToken(event);
    let identifier = `ip:${clientIpFromHeaders(event.headers as Record<string, string | undefined>)}`;
    if (token) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        identifier = `uid:${decoded.uid}`;
      } catch {
        return json(401, {error: "Your login session has expired. Please log in again."}, origin);
      }
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "pdf-export",
      identifier,
      limit: PDF_LIMIT,
      windowSeconds: PDF_WINDOW_SECONDS,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        {error: "Too many PDF exports. Please try again later."},
        origin,
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    const safeName = (payload.fileName || "CareerUnified-Resume")
      .toString()
      .replace(/[^a-z0-9\-_]/gi, "_")
      .slice(0, 60);
    const executablePath = await chromium.executablePath();
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", request => {
        const permittedType = ["stylesheet", "font", "image", "media"].includes(
          request.resourceType(),
        );
        if (permittedType && allowedAssetUrl(request.url())) {
          void request.continue();
        } else {
          void request.abort();
        }
      });
      page.setDefaultNavigationTimeout(12_000);
      page.setDefaultTimeout(12_000);

      await page.setContent(payload.html, {waitUntil: "domcontentloaded", timeout: 12_000});
      await page.emulateMediaType("screen");
      await new Promise(resolve => setTimeout(resolve, 500));

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {top: "0", right: "0", bottom: "0", left: "0"},
      });

      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
          "Cache-Control": "no-store",
        },
        body: pdfBuffer.toString("base64"),
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("EXPORT_PDF_ERROR", error instanceof Error ? error.message : "Unknown error");
    return json(500, {error: "PDF generation failed. Please try again."}, origin);
  }
};
