import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit } from "./_rateLimit";

type RecruiterPlanId = "starter" | "pro" | "enterprise";
type RecruiterBillingPeriod = "monthly" | "yearly";

const PLAN_CONFIG: Record<RecruiterPlanId, { monthlyAmount: string; yearlyAmount: string; label: string; unlocks: number }> = {
  starter: { monthlyAmount: "299.00", yearlyAmount: "3229.20", label: "Starter", unlocks: 50 },
  pro: { monthlyAmount: "699.00", yearlyAmount: "7549.20", label: "Growth", unlocks: 200 },
  enterprise: { monthlyAmount: "1499.00", yearlyAmount: "16189.20", label: "Agency", unlocks: -1 },
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
  "custom_str4",
  "subscription_type",
  "billing_date",
  "recurring_amount",
  "frequency",
  "cycles",
] as const;

function corsHeaders(origin?: string) {
  const allowed = process.env.ALLOWED_ORIGIN || process.env.SITE_URL || "";
  const cleanAllowed = allowed.replace(/\/+$/, "");
  const cleanOrigin = origin?.replace(/\/+$/, "");

  return {
    "Access-Control-Allow-Origin": cleanAllowed && cleanOrigin === cleanAllowed ? cleanOrigin : cleanAllowed || "null",
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
  return isBase64Encoded ? Buffer.from(eventBody, "base64").toString("utf8") : eventBody;
}

function isRecruiterPlan(plan: unknown): plan is RecruiterPlanId {
  return plan === "starter" || plan === "pro" || plan === "enterprise";
}

function isRecruiterBillingPeriod(period: unknown): period is RecruiterBillingPeriod {
  return period === "monthly" || period === "yearly";
}

function encodePayfastValue(value: string) {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function generateSignature(fields: Record<string, string>, passphrase?: string) {
  const payload = PAYFAST_FIELD_ORDER.filter((key) => fields[key])
    .map((key) => `${key}=${encodePayfastValue(fields[key])}`)
    .join("&");
  const signedPayload = passphrase ? `${payload}&passphrase=${encodePayfastValue(passphrase)}` : payload;
  return crypto.createHash("md5").update(signedPayload).digest("hex");
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
  const baseHeaders = corsHeaders(event.headers.origin || event.headers.Origin);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };

  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" }, baseHeaders);

    const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
    if (missing.length) {
      return json(500, { error: "Missing required environment variables.", missing }, baseHeaders);
    }

    const modeError = validatePayfastMode(baseHeaders);
    if (modeError) return modeError;

    let body: any;
    try {
      body = JSON.parse(decodeBody(event.body, event.isBase64Encoded) || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" }, baseHeaders);
    }

    const plan = body?.plan;
    if (!isRecruiterPlan(plan)) {
      return json(400, { error: "Invalid plan. Use starter | pro | enterprise." }, baseHeaders);
    }

    const billingPeriod = body?.billingPeriod ?? "monthly";
    if (!isRecruiterBillingPeriod(billingPeriod)) {
      return json(400, { error: "Invalid billing period. Use monthly or yearly." }, baseHeaders);
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return json(401, { error: "Missing Authorization Bearer token" }, baseHeaders);

    const admin = getAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded.recruiter !== true) return json(403, { error: "Recruiter access only" }, baseHeaders);

    const recruiterId = decoded.uid;
    const recruiterRef = admin.firestore().doc(`recruiters/${recruiterId}`);
    const recruiterSnap = await recruiterRef.get();
    const recruiter = recruiterSnap.data() || {};

    const rateLimit = await checkRateLimit({
      admin,
      action: "recruiter-subscription-checkout",
      identifier: recruiterId,
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

    const email = decoded.email || (recruiter.email as string | undefined);
    if (!email) return json(400, { error: "Recruiter email not found" }, baseHeaders);

    const nameFirst =
      firstNameFrom(decoded.name) ||
      (recruiter.firstName as string | undefined) ||
      firstNameFrom(recruiter.fullName as string | undefined) ||
      firstNameFrom(recruiter.companyName as string | undefined) ||
      "Recruiter";

    const siteUrl = process.env.SITE_URL!.replace(/\/+$/, "");
    const cfg = PLAN_CONFIG[plan];
    const amount = billingPeriod === "yearly" ? cfg.yearlyAmount : cfg.monthlyAmount;
    const frequency = billingPeriod === "yearly" ? "6" : "3";
    const m_payment_id = `rec_${recruiterId}_${Date.now()}`;

    const fields: Record<string, string> = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID!,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY!,
      return_url: `${siteUrl}/recruiter-dashboard.html?payment=pending`,
      cancel_url: `${siteUrl}/recruiter-dashboard.html#billing`,
      notify_url: `${siteUrl}/.netlify/functions/payfast-itn`,
      name_first: nameFirst,
      email_address: email,
      m_payment_id,
      amount,
      item_name: `Career Unified Recruiter ${cfg.label} ${billingPeriod} subscription`,
      custom_str1: recruiterId,
      custom_str2: plan,
      custom_str3: "careerunified-recruiter",
      custom_str4: billingPeriod,
      subscription_type: "1",
      billing_date: new Date().toISOString().slice(0, 10),
      recurring_amount: amount,
      frequency,
      cycles: "0",
    };

    fields.signature = generateSignature(fields, process.env.PAYFAST_PASSPHRASE);

    const checkoutRef = admin.firestore().collection("payfastCheckouts").doc(m_payment_id);
    const batch = admin.firestore().batch();

    batch.set(
      recruiterRef,
      {
        pendingPlan: plan,
        pendingBillingPeriod: billingPeriod,
        pendingPayfastPaymentId: m_payment_id,
        pendingCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(checkoutRef, {
      paymentId: m_payment_id,
      uid: recruiterId,
      plan,
      billingPeriod,
      frequency: Number(frequency),
      product: "careerunified-recruiter",
      expectedAmount: Number(amount),
      currency: "ZAR",
      status: "pending",
      mode: process.env.PAYFAST_MODE === "live" ? "live" : "sandbox",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    const payment_url =
      process.env.PAYFAST_MODE === "live"
        ? "https://www.payfast.co.za/eng/process"
        : "https://sandbox.payfast.co.za/eng/process";

    return json(200, { payment_url, fields }, baseHeaders);
  } catch (error: any) {
    console.error("CREATE_RECRUITER_SUBSCRIPTION_ERROR", error);
    return json(
      500,
      { error: "Could not start PayFast checkout." },
      baseHeaders
    );
  }
};
