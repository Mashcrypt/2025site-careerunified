import type { Handler } from "@netlify/functions";
import { getAdmin } from "./_firebaseAdmin";

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
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
  if (event.httpMethod !== "GET") return json(405, { error: "Method Not Allowed" });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return json(401, { error: "Missing Authorization Bearer token" });

  const admin = getAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  const uid = decoded.uid;

  const userRef = admin.firestore().doc(`users/${uid}`);
  const snap = await userRef.get();
  const user = snap.data() || {};

  const plan = (user.plan as string) || "free";
  const subscriptionStatus = (user.subscriptionStatus as string) || "active";

  const used = Number(user.applicationsUsedThisMonth || 0);
  const limit = planLimit(plan);

  const freeResumeUsed = Boolean(user.freeResumeUsed);
  const freeCoverUsed = Boolean(user.freeCoverUsed);

  return json(200, {
    plan,
    subscriptionStatus,
    used,
    limit: Number.isFinite(limit) ? limit : null, // null means unlimited
    freeResumeUsed,
    freeCoverUsed,
  });
};
