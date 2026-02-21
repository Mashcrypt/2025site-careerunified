import type { Handler } from "@netlify/functions";
import { getAdmin } from "./_firebaseAdmin";

type PlanId = "starter" | "job_seeker" | "career_pro";

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getPlanCode(plan: PlanId) {
  if (plan === "starter") return process.env.PAYSTACK_PLAN_STARTER;
  if (plan === "job_seeker") return process.env.PAYSTACK_PLAN_JOBSEEKER;
  return process.env.PAYSTACK_PLAN_CAREERPRO;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) return json(500, { error: "Missing PAYSTACK_SECRET_KEY" });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return json(401, { error: "Missing Authorization Bearer token" });

  let plan: PlanId | undefined;
  try {
    const parsed = JSON.parse(event.body || "{}");
    plan = parsed?.plan;
  } catch {}
  if (!plan || !["starter", "job_seeker", "career_pro"].includes(plan)) {
    return json(400, { error: "Invalid plan. Use starter | job_seeker | career_pro" });
  }

  const planCode = getPlanCode(plan as PlanId);
  if (!planCode) return json(500, { error: `Missing plan code env var for ${plan}` });

  const admin = getAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  const uid = decoded.uid;

  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  const email =
    userSnap.exists ? (userSnap.data()?.email as string | undefined) : decoded.email;

  if (!email) return json(400, { error: "User email not found. Ensure Firebase Auth provides email." });

  // Create Paystack transaction → subscription created after successful payment
  const callbackUrl = `${event.headers.origin || "https://YOURDOMAIN.com"}/billing/success`;

  const payload = {
    email,
    plan: planCode, // Paystack "plan" field accepts plan_code for subscriptions :contentReference[oaicite:6]{index=6}
    callback_url: callbackUrl,
    metadata: {
      uid,
      selectedPlan: plan,
      source: "careerunified-ai",
    },
    // optional: restrict channels if you want
    // channels: ["card", "bank_transfer", "eft"],
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

  if (!res.ok || !data?.status) {
    return json(500, { error: "Paystack initialize failed", details: data || null });
  }

  return json(200, {
    authorization_url: data.data.authorization_url,
    reference: data.data.reference,
  });
};
