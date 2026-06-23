import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit } from "./_rateLimit";

const CREDIT_PACK_ID = "ai_tailor_10" as const;
const CREDIT_PACK_AMOUNT = "19.00";
const CREDIT_PACK_QUANTITY = 10;
const CREDIT_PRODUCT = "careerunified-ai-credits";

const REQUIRED_ENV = [
  "PAYFAST_MERCHANT_ID",
  "PAYFAST_MERCHANT_KEY",
  "PAYFAST_PASSPHRASE",
  "SITE_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

const PAYFAST_FIELD_ORDER = [
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "name_first",
  "email_address",
  "m_payment_id",
  "amount",
  "item_name",
  "custom_str1",
  "custom_str2",
  "custom_str3",
] as const;

function corsHeaders(origin?: string) {
  const allowed = process.env.ALLOWED_ORIGIN || process.env.SITE_URL || "*";
  const cleanAllowed = allowed.replace(/\/+$/, "");
  const cleanOrigin = origin?.replace(/\/+$/, "");
  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : cleanOrigin === cleanAllowed ? cleanOrigin : cleanAllowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(statusCode: number, body: any, headers?: Record<string, string>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body),
  };
}

function encodePayfastValue(value: string) {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function generateSignature(fields: Record<string, string>, passphrase?: string) {
  const payload = PAYFAST_FIELD_ORDER.filter((key) => {
    const value = fields[key];
    return value !== undefined && value !== null && value !== "";
  })
    .map((key) => `${key}=${encodePayfastValue(fields[key])}`)
    .join("&");

  const withPassphrase = passphrase
    ? `${payload}&passphrase=${encodePayfastValue(passphrase)}`
    : payload;

  return crypto.createHash("md5").update(withPassphrase).digest("hex");
}

function decodeBody(eventBody: string | null | undefined, isBase64Encoded?: boolean) {
  if (!eventBody) return "";
  if (!isBase64Encoded) return eventBody;
  return Buffer.from(eventBody, "base64").toString("utf8");
}

function parseJsonBody(eventBody: string | null | undefined, isBase64Encoded?: boolean) {
  const rawBody = decodeBody(eventBody, isBase64Encoded);
  if (!rawBody.trim()) return {};
  return JSON.parse(rawBody);
}

function firstNameFrom(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || undefined;
}

function validatePayfastMode(headers?: Record<string, string>) {
  const siteUrl = process.env.SITE_URL || "";
  if (process.env.PAYFAST_MODE === "live" && !siteUrl.startsWith("https://")) {
    return json(
      500,
      {
        error: "Invalid PayFast live configuration.",
        details: "PAYFAST_MODE=live requires SITE_URL to be your deployed HTTPS site URL.",
      },
      headers
    );
  }
  return null;
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const baseHeaders = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };

  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" }, baseHeaders);

    const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
    if (missingEnv.length > 0) {
      return json(500, { error: "Missing required environment variables.", missing: missingEnv }, baseHeaders);
    }

    const modeError = validatePayfastMode(baseHeaders);
    if (modeError) return modeError;

    try {
      parseJsonBody(event.body, event.isBase64Encoded);
    } catch {
      return json(400, { error: "Invalid JSON body" }, baseHeaders);
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return json(401, { error: "Missing Authorization Bearer token" }, baseHeaders);

    const admin = getAdmin();

    let uid = "";
    let email: string | undefined;
    let nameFirst: string | undefined;

    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
      email = decoded.email;
      nameFirst = firstNameFrom(decoded.name);
    } catch {
      return json(401, { error: "Invalid or expired token" }, baseHeaders);
    }

    const userRef = admin.firestore().doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const user = userSnap.data() || {};

    const rateLimit = await checkRateLimit({
      admin,
      action: "ai-credit-checkout",
      identifier: uid,
      limit: 5,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        {
          error: "Too many checkout attempts. Please try again shortly.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { ...baseHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) }
      );
    }

    email = email || (user.email as string | undefined);
    if (!email) return json(400, { error: "User email not found" }, baseHeaders);

    nameFirst =
      nameFirst ||
      (user.firstName as string | undefined) ||
      firstNameFrom(user.fullName as string | undefined) ||
      "Customer";

    const siteUrl = process.env.SITE_URL!.replace(/\/+$/, "");
    const m_payment_id = `credits_${uid}_${Date.now()}`;

    const fields: Record<string, string> = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID!,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY!,
      return_url: `${siteUrl}/billing/success?product=credits`,
      cancel_url: `${siteUrl}/cv-generator/`,
      notify_url: `${siteUrl}/.netlify/functions/payfast-itn`,
      name_first: nameFirst,
      email_address: email,
      m_payment_id,
      amount: CREDIT_PACK_AMOUNT,
      item_name: `Career Unified ${CREDIT_PACK_QUANTITY} AI Tailors`,
      custom_str1: uid,
      custom_str2: CREDIT_PACK_ID,
      custom_str3: CREDIT_PRODUCT,
    };

    fields.signature = generateSignature(fields, process.env.PAYFAST_PASSPHRASE);

    await userRef.set(
      {
        pendingCreditPack: CREDIT_PACK_ID,
        pendingCreditQuantity: CREDIT_PACK_QUANTITY,
        pendingCreditPayfastPaymentId: m_payment_id,
        pendingCreditCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const payment_url =
      process.env.PAYFAST_MODE === "live"
        ? "https://www.payfast.co.za/eng/process"
        : "https://sandbox.payfast.co.za/eng/process";

    return json(200, { payment_url, fields }, baseHeaders);
  } catch (error) {
    console.error("CREATE_AI_CREDIT_PAYMENT_ERROR", error);
    return json(500, { error: "Could not start PayFast checkout." }, baseHeaders);
  }
};
