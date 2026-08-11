import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit } from "./_rateLimit";

const PRODUCT = "careerunified-recruiter-single-job";
const PACK_ID = "single_job_30";
const AMOUNT = "199.00";

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
  const allowed = process.env.ALLOWED_ORIGIN || process.env.SITE_URL || "";
  const cleanAllowed = allowed.replace(/\/+$/, "");
  const cleanOrigin = origin?.replace(/\/+$/, "");
  return {
    "Access-Control-Allow-Origin": cleanAllowed && cleanOrigin === cleanAllowed ? cleanOrigin : cleanAllowed || "null",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(statusCode: number, body: unknown, headers?: Record<string, string>) {
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
  const payload = PAYFAST_FIELD_ORDER.filter((key) => fields[key])
    .map((key) => `${key}=${encodePayfastValue(fields[key])}`)
    .join("&");
  const signedPayload = passphrase ? `${payload}&passphrase=${encodePayfastValue(passphrase)}` : payload;
  return crypto.createHash("md5").update(signedPayload).digest("hex");
}

function firstNameFrom(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || undefined;
}

function timestampToDate(value: any) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasActiveRecruiterAccess(recruiter: any) {
  const periodEnd = timestampToDate(recruiter?.subscriptionCurrentPeriodEnd);
  const hasPaidSubscription = recruiter?.plan && recruiter.plan !== "free"
    && recruiter?.subscriptionStatus === "active"
    && !!periodEnd
    && periodEnd.getTime() > Date.now();

  const trialEnd = timestampToDate(recruiter?.trialEndsAt);
  const hasActiveTrial = recruiter?.plan === "pro"
    && recruiter?.subscriptionStatus === "trialing"
    && !!trialEnd
    && trialEnd.getTime() > Date.now();

  return hasPaidSubscription || hasActiveTrial;
}

export const handler: Handler = async (event) => {
  const baseHeaders = corsHeaders(event.headers.origin || event.headers.Origin);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };

  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" }, baseHeaders);

    const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
    if (missing.length) return json(500, { error: "Payment is not configured." }, baseHeaders);

    const siteUrl = process.env.SITE_URL!.replace(/\/+$/, "");
    if (process.env.PAYFAST_MODE === "live" && !siteUrl.startsWith("https://")) {
      return json(500, { error: "Invalid PayFast live configuration." }, baseHeaders);
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return json(401, { error: "Please sign in again." }, baseHeaders);

    const admin = getAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded.recruiter !== true) return json(403, { error: "Recruiter access only." }, baseHeaders);

    const recruiterId = decoded.uid;
    const recruiterRef = admin.firestore().doc(`recruiters/${recruiterId}`);
    const recruiterSnap = await recruiterRef.get();
    const recruiter = recruiterSnap.data() || {};
    if (hasActiveRecruiterAccess(recruiter)) {
      return json(409, { error: "Vacancy publishing is already included in your active plan." }, baseHeaders);
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "recruiter-single-job-checkout",
      identifier: recruiterId,
      limit: 5,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        { error: "Too many checkout attempts. Please try again shortly." },
        { ...baseHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) }
      );
    }

    const email = decoded.email || (recruiter.email as string | undefined);
    if (!email) return json(400, { error: "Recruiter email not found." }, baseHeaders);

    const nameFirst =
      firstNameFrom(decoded.name) ||
      (recruiter.firstName as string | undefined) ||
      firstNameFrom(recruiter.fullName as string | undefined) ||
      firstNameFrom(recruiter.companyName as string | undefined) ||
      "Recruiter";

    const paymentId = `recjob_${recruiterId}_${Date.now()}`;
    const fields: Record<string, string> = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID!,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY!,
      return_url: `${siteUrl}/recruiter-dashboard.html?payment=single-job-pending#billing`,
      cancel_url: `${siteUrl}/recruiter-dashboard.html#billing`,
      notify_url: `${siteUrl}/.netlify/functions/payfast-itn`,
      name_first: nameFirst,
      email_address: email,
      m_payment_id: paymentId,
      amount: AMOUNT,
      item_name: "Career Unified single promoted job listing",
      custom_str1: recruiterId,
      custom_str2: PACK_ID,
      custom_str3: PRODUCT,
    };
    fields.signature = generateSignature(fields, process.env.PAYFAST_PASSPHRASE);

    const checkoutRef = admin.firestore().collection("payfastCheckouts").doc(paymentId);
    const batch = admin.firestore().batch();

    batch.set(
      recruiterRef,
      {
        pendingSingleJobPack: PACK_ID,
        pendingSingleJobPayfastPaymentId: paymentId,
        pendingSingleJobCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(checkoutRef, {
      paymentId,
      uid: recruiterId,
      plan: PACK_ID,
      product: PRODUCT,
      expectedAmount: Number(AMOUNT),
      currency: "ZAR",
      status: "pending",
      mode: process.env.PAYFAST_MODE === "live" ? "live" : "sandbox",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    const paymentUrl = process.env.PAYFAST_MODE === "live"
      ? "https://www.payfast.co.za/eng/process"
      : "https://sandbox.payfast.co.za/eng/process";

    return json(200, { payment_url: paymentUrl, fields }, baseHeaders);
  } catch (error) {
    console.error("CREATE_RECRUITER_SINGLE_JOB_PAYMENT_ERROR", error);
    return json(500, { error: "Could not start PayFast checkout." }, baseHeaders);
  }
};
