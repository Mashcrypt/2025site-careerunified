import type { Handler } from "@netlify/functions";
import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit } from "./_rateLimit";

const TRIAL_DAYS = 7;
const TRIAL_UNLOCKS = 200;

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

function timestampToDate(value: any) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function hasActivePaidSubscription(recruiter: any, now: Date) {
  const periodEnd = timestampToDate(recruiter?.subscriptionCurrentPeriodEnd);
  return recruiter?.plan && recruiter.plan !== "free"
    && recruiter?.subscriptionStatus === "active"
    && !!periodEnd
    && periodEnd.getTime() > now.getTime();
}

export const handler: Handler = async (event) => {
  const baseHeaders = corsHeaders(event.headers.origin || event.headers.Origin);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };

  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" }, baseHeaders);

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return json(401, { error: "Please sign in again." }, baseHeaders);

    const admin = getAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded.recruiter !== true) return json(403, { error: "Recruiter access only." }, baseHeaders);

    const rateLimit = await checkRateLimit({
      admin,
      action: "recruiter-free-trial",
      identifier: decoded.uid,
      limit: 3,
      windowSeconds: 24 * 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        { error: "Too many trial requests. Please try again later." },
        { ...baseHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) }
      );
    }

    const recruiterRef = admin.firestore().doc(`recruiters/${decoded.uid}`);
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    await admin.firestore().runTransaction(async (transaction) => {
      const recruiterSnap = await transaction.get(recruiterRef);
      if (!recruiterSnap.exists) throw new TrialError(403, "Recruiter profile not found.");

      const recruiter = recruiterSnap.data() || {};
      if (hasActivePaidSubscription(recruiter, now)) {
        throw new TrialError(409, "Your current subscription already includes these features.");
      }

      if (
        recruiter.trialClaimedAt || recruiter.trialStartedAt || recruiter.trialEndsAt
        || recruiter.subscriptionCurrentPeriodStart || recruiter.subscriptionCurrentPeriodEnd
      ) {
        throw new TrialError(409, "The free trial is only available once for new recruiter accounts.");
      }

      transaction.update(recruiterRef, {
        plan: "pro",
        subscriptionStatus: "trialing",
        trialPlan: "pro",
        trialStartedAt: admin.firestore.Timestamp.fromDate(now),
        trialEndsAt: admin.firestore.Timestamp.fromDate(trialEnd),
        trialClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalUnlocks: TRIAL_UNLOCKS,
        unlocksRemaining: TRIAL_UNLOCKS,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return json(200, {
      plan: "pro",
      trialEndsAt: trialEnd.toISOString(),
      unlocksRemaining: TRIAL_UNLOCKS,
    }, baseHeaders);
  } catch (error) {
    if (error instanceof TrialError) return json(error.statusCode, { error: error.message }, baseHeaders);
    console.error("start-recruiter-trial failed", error);
    return json(500, { error: "Could not start the free trial. Please try again." }, baseHeaders);
  }
};

class TrialError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
