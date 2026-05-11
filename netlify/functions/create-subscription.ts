import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit } from "./_rateLimit";

type PlanId = "starter" | "job_seeker" | "career_pro";

const PLAN_AMOUNT: Record<PlanId, string> = {
  starter: "29.00",
  job_seeker: "69.00",
  career_pro: "149.00",
};

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
  "subscription_type",
  "billing_date",
  "recurring_amount",
  "frequency",
  "cycles",
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

function isPlanId(plan: unknown): plan is PlanId {
  return plan === "starter" || plan === "job_seeker" || plan === "career_pro";
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
      return json(
        500,
        {
          error: "Missing required environment variables.",
          missing: missingEnv,
        },
        baseHeaders
      );
    }

    const modeError = validatePayfastMode(baseHeaders);
    if (modeError) return modeError;

    let body: any;
    try {
      body = parseJsonBody(event.body, event.isBase64Encoded);
    } catch {
      return json(400, { error: "Invalid JSON body" }, baseHeaders);
    }

    const plan = body?.plan;
    if (!isPlanId(plan)) {
      return json(400, { error: "Invalid plan. Use starter | job_seeker | career_pro." }, baseHeaders);
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
      action: "cv-subscription-checkout",
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
    const amount = PLAN_AMOUNT[plan];
    const m_payment_id = `sub_${uid}_${Date.now()}`;

    const fields: Record<string, string> = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID!,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY!,
      return_url: `${siteUrl}/billing/success`,
      cancel_url: `${siteUrl}/cv-generator/`,
      notify_url: `${siteUrl}/.netlify/functions/payfast-itn`,
      name_first: nameFirst,
      email_address: email,
      m_payment_id,
      amount,
      item_name: `Career Unified ${formatPlanName(plan)} subscription`,
      custom_str1: uid,
      custom_str2: plan,
      custom_str3: "careerunified-ai",
      subscription_type: "1",
      recurring_amount: amount,
      frequency: "3",
      cycles: "0",
    };

    fields.signature = generateSignature(fields, process.env.PAYFAST_PASSPHRASE);

    await userRef.set(
      {
        pendingPlan: plan,
        pendingPayfastPaymentId: m_payment_id,
        pendingCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const payment_url =
      process.env.PAYFAST_MODE === "live"
        ? "https://www.payfast.co.za/eng/process"
        : "https://sandbox.payfast.co.za/eng/process";

    return json(200, { payment_url, fields }, baseHeaders);
  } catch (error: any) {
    console.error("CREATE_SUBSCRIPTION_ERROR", error);
    return json(
      500,
      { error: "Could not start PayFast checkout." },
      baseHeaders
    );
  }
};

function formatPlanName(plan: PlanId) {
  if (plan === "starter") return "Starter";
  if (plan === "job_seeker") return "Job Seeker";
  return "Career Pro";
}
