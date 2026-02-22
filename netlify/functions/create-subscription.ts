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

function getSiteUrl(event: any) {
  // Netlify provides these env vars in production
  const envUrl =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.SITE_URL ||
    "";

  // As fallback, try request origin
  const origin = event.headers?.origin || event.headers?.Origin || "";

  // Prefer env URL because origin can be missing
  const base = (envUrl || origin || "").replace(/\/$/, "");

  // Final fallback (avoid placeholders)
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
  if (!paystackSecret) return json(500, { error: "Missing PAYSTACK_SECRET_KEY" }, baseHeaders);

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return json(401, { error: "Missing Authorization Bearer token" }, baseHeaders);

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
  if (!planCode) return json(500, { error: `Missing plan code env var for ${plan}` }, baseHeaders);

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
      { error: "User email not found. Ensure Firebase Auth provides email or save it in users/{uid}." },
      baseHeaders
    );
  }

  // Use a reliable site URL for callback
  const siteUrl = getSiteUrl(event);
  const callbackUrl = `${siteUrl}/billing/success`;

  const payload = {
    email,
    plan: planCode, // Paystack expects plan_code here for subscriptions
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

  // Paystack returns status: true/false + message
  if (!res.ok || !data?.status || !data?.data?.authorization_url) {
    return json(
      500,
      {
        error: "Paystack initialize failed",
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
