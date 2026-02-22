import type { Handler } from "@netlify/functions";
import { getAdmin } from "./_firebaseAdmin";

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

function planLimit(plan: string) {
  if (plan === "starter") return 5;
  if (plan === "job_seeker") return 20;
  if (plan === "career_pro") return Number.POSITIVE_INFINITY;
  return 0; // free
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const baseHeaders = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: baseHeaders, body: "" };
  }

  if (event.httpMethod !== "GET") return json(405, { error: "Method Not Allowed" }, baseHeaders);

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return json(401, { error: "Missing Authorization Bearer token" }, baseHeaders);

  const admin = getAdmin();

  let uid = "";
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return json(401, { error: "Invalid or expired token" }, baseHeaders);
  }

  const userRef = admin.firestore().doc(`users/${uid}`);
  const snap = await userRef.get();
  const user = snap.data() || {};

  const plan = (user.plan as string) || "free";
  const subscriptionStatus =
    (user.subscriptionStatus as string) || (plan === "free" ? "inactive" : "active");

  const used = Number(user.applicationsUsedThisMonth || 0);
  const limit = planLimit(plan);

  const freeResumeUsed = Boolean(user.freeResumeUsed);
  const freeCoverUsed = Boolean(user.freeCoverUsed);

  return json(
    200,
    {
      plan,
      subscriptionStatus,
      used,
      limit: Number.isFinite(limit) ? limit : null, // null = unlimited
      freeResumeUsed,
      freeCoverUsed,
      pendingPlan: (user.pendingPlan as string) || null,
      pendingPaystackReference: (user.pendingPaystackReference as string) || null,
    },
    baseHeaders
  );
};
