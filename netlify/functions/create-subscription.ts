import type { Handler } from "@netlify/functions";
import { getAdmin } from "./_firebaseAdmin";

type PlanId = "starter" | "job_seeker" | "career_pro";

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

function json(statusCode: number, body: any, headers?: Record<string, string>) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  };
}

function decodeBody(eventBody: string | null | undefined, isB64?: boolean) {
  if (!eventBody) return "";
  if (!isB64) return eventBody;
  try {
    return Buffer.from(eventBody, "base64").toString("utf8");
  } catch {
    return eventBody;
  }
}

function getPlanCode(plan: PlanId) {
  if (plan === "starter") return process.env.PAYSTACK_PLAN_STARTER;
  if (plan === "job_seeker") return process.env.PAYSTACK_PLAN_JOBSEEKER;
  return process.env.PAYSTACK_PLAN_CAREERPRO;
}

/**
 * Paystack transaction/initialize still expects an `amount`
 * (smallest currency unit: cents for ZAR).
 *
 * Add these env vars in Netlify:
 * - PAYSTACK_AMOUNT_STARTER
 * - PAYSTACK_AMOUNT_JOBSEEKER
 * - PAYSTACK_AMOUNT_CAREERPRO
 *
 * Example values (ZAR):
 * - 9900  = R99.00
 * - 14900 = R149.00
 * - 24900 = R249.00
 */
function getPlanAmount(plan: PlanId) {
  const raw =
    plan === "starter"
      ? process.env.PAYSTACK_AMOUNT_STARTER
      : plan === "job_seeker"
      ? process.env.PAYSTACK_AMOUNT_JOBSEEKER
      : process.env.PAYSTACK_AMOUNT_CAREERPRO;

  if (!raw) return null;

  const amount = Number(raw);
  if (!Number.isFinite(amount)) return null;
  if (amount <= 0) return null;

  // Paystack expects integer amount (smallest unit)
  return Math.round(amount);
}

function getSiteUrl(event: any) {
  const envUrl =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.SITE_URL ||
    "";

  const origin = event.headers?.origin || event.headers?.Origin || "";
  const base = (envUrl || origin || "").replace(/\/$/, "");

  return base || "https://careerunified.com";
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const baseHeaders = corsHeaders(origin);

  // Preflight (CORS)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: baseHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" }, baseHeaders);
  }

  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) {
    return json(500, { error: "Missing PAYSTACK_SECRET_KEY" }, baseHeaders);
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return json(401, { error: "Missing Authorization Bearer token" }, baseHeaders);
  }

  // Parse body safely (Netlify can base64 encode)
  const rawBody = decodeBody(event.body, event.isBase64Encoded);

  let plan: PlanId | undefined;
  try {
    const parsed = JSON.parse(rawBody || "{}");
    plan = parsed?.plan;
  } catch {
    // ignore
  }

  if (!plan || !["starter", "job_seeker", "career_pro"].includes(plan)) {
    return json(400, { error: "Invalid plan. Use starter | job_seeker | career_pro" }, baseHeaders);
  }

  const planCode = getPlanCode(plan);
  if (!planCode) {
    return json(500, { error: `Missing plan code env var for ${plan}` }, baseHeaders);
  }

  const amount = getPlanAmount(plan);
  if (!amount) {
    return json(
      500,
      {
        error: `Missing/invalid amount env var for ${plan}.`,
        hint:
          "Set PAYSTACK_AMOUNT_STARTER / PAYSTACK_AMOUNT_JOBSEEKER / PAYSTACK_AMOUNT_CAREERPRO to an integer in cents (e.g. 9900 = R99.00).",
      },
      baseHeaders
    );
  }

  const currency = (process.env.PAYSTACK_CURRENCY || "ZAR").toUpperCase();

  const admin = getAdmin();

  // Verify token safely
  let uid = "";
  let tokenEmail: string | undefined;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
    tokenEmail = decoded.email;
  } catch {
    return json(401, { error: "Invalid or expired token" }, baseHeaders);
  }

  // Get email from users doc OR token
  const userRef = admin.firestore().doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const user = userSnap.data() || {};

  const email = (user.email as string | undefined) || tokenEmail;
  if (!email) {
    return json(
      400,
      {
        error:
          "User email not found. Ensure Firebase Auth provides email or save it in users/{uid}.",
      },
      baseHeaders
    );
  }

  const siteUrl = getSiteUrl(event);
  const callbackUrl = `${siteUrl}/billing/success`;

  // ✅ Paystack initialize payload
  // NOTE: `amount` is REQUIRED here (smallest currency unit)
  const payload = {
    email,
    amount,
    currency,
    plan: planCode,
    callback_url: callbackUrl,
    metadata: {
      uid,
      selectedPlan: plan,
      source: "careerunified-ai",
    },
  };

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.status || !data?.data?.authorization_url) {
    return json(
      500,
      {
        error: "Paystack initialize failed",
        request_payload: {
          // don’t echo secrets; safe fields only
          email,
          amount,
          currency,
          plan: planCode,
          callback_url: callbackUrl,
          metadata: payload.metadata,
        },
        paystack_status: data?.status ?? null,
        paystack_message: data?.message ?? null,
        details: data,
      },
      baseHeaders
    );
  }

  // Save pending upgrade (helps your webhook finalize confidently)
  await userRef.set(
    {
      pendingPlan: plan,
      pendingPaystackReference: data.data.reference,
      pendingCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return json(
    200,
    {
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    },
    baseHeaders
  );
};
