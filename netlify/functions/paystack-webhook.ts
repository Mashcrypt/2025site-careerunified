import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { getAdmin } from "./_firebaseAdmin";

function ok() {
  return { statusCode: 200, body: "ok" };
}

function bad(statusCode: number, msg: string) {
  return { statusCode, body: msg };
}

function decodeRawBody(event: any) {
  const body = event.body || "";
  if (!body) return "";
  if (event.isBase64Encoded) {
    return Buffer.from(body, "base64").toString("utf8");
  }
  return body;
}

function verifySignature(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

function isValidPlan(plan: any): plan is "starter" | "job_seeker" | "career_pro" {
  return plan === "starter" || plan === "job_seeker" || plan === "career_pro";
}

// ✅ Recruiter plans (NEW)
function isValidRecruiterPlan(plan: any): plan is "starter" | "pro" | "enterprise" {
  return plan === "starter" || plan === "pro" || plan === "enterprise";
}

export const handler: Handler = async (event) => {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) return bad(500, "Missing PAYSTACK_SECRET_KEY");

  const signature =
    (event.headers["x-paystack-signature"] as string) ||
    (event.headers["X-Paystack-Signature"] as string);

  const rawBody = decodeRawBody(event);

  // Verify webhook signature
  if (!verifySignature(rawBody, signature, paystackSecret)) {
    return bad(401, "Invalid signature");
  }

  let payload: any = null;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return bad(400, "Invalid JSON");
  }

  const eventType = payload?.event as string;
  const data = payload?.data || {};

  const admin = getAdmin();

  // --- Recommended: treat charge.success as the primary "unlock" event ---
  if (eventType === "charge.success") {
    // ============================================================
    // ✅ NEW: RECRUITER SUBSCRIPTION BRANCH (does NOT affect AI)
    // Detect recruiter payments using metadata.recruiterId + metadata.plan
    // This matches what you send in paystack-init.js:
    // metadata: { recruiterId, plan, unlocks, product: ... }
    // ============================================================
    const recruiterId = data?.metadata?.recruiterId as string | undefined;
    const recruiterPlan = data?.metadata?.plan as string | undefined;

    if (recruiterId && recruiterPlan) {
      // Only handle if it matches recruiter plan set
      if (!isValidRecruiterPlan(recruiterPlan)) return ok();

      // (Optional but recommended) Validate amount & currency against your plan pricing
      const PLAN_CONFIG: Record<"starter" | "pro" | "enterprise", { amount: number; currency: string; unlocks: number }> =
        {
          starter: { amount: 29900, currency: "ZAR", unlocks: 50 },
          pro: { amount: 69900, currency: "ZAR", unlocks: 200 },
          enterprise: { amount: 149900, currency: "ZAR", unlocks: -1 },
        };

      const expected = PLAN_CONFIG[recruiterPlan];
      const txAmount = Number(data?.amount);
      const txCurrency = String(data?.currency || "").toUpperCase();

      // If these don’t match, ignore safely (prevents tampering)
      if (txCurrency !== expected.currency) return ok();
      if (txAmount !== expected.amount) return ok();

      const recruiterRef = admin.firestore().doc(`recruiters/${recruiterId}`);

      await recruiterRef.set(
        {
          plan: recruiterPlan,
          unlocksRemaining: expected.unlocks,
          totalUnlocks: expected.unlocks,
          upgradedAt: new Date().toISOString(),
          paystack: {
            lastEvent: eventType,
            lastReference: data?.reference || null,
            customer_code: data?.customer?.customer_code || null,
            authorization: data?.authorization || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return ok();
    }

    // ============================================================
    // ✅ EXISTING AI PLAN LOGIC (UNCHANGED)
    // We rely on metadata.uid set during initialize
    // ============================================================
    const uid = data?.metadata?.uid as string | undefined;
    if (!uid) return ok(); // ignore safely

    const userRef = admin.firestore().doc(`users/${uid}`);

    // Helper: activate plan safely
    const activatePlan = async (planToUse: string, extraPaystack?: Record<string, any>) => {
      await userRef.set(
        {
          plan: planToUse,
          subscriptionStatus: "active",
          applicationsUsedThisMonth: 0,
          pendingPlan: admin.firestore.FieldValue.delete(),
          pendingPaystackReference: admin.firestore.FieldValue.delete(),
          pendingCreatedAt: admin.firestore.FieldValue.delete(),
          paystack: {
            ...(extraPaystack || {}),
            lastEvent: eventType,
            lastReference: data?.reference || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    };

    const selectedPlan = data?.metadata?.selectedPlan;
    const refFromPaystack = data?.reference as string | undefined;

    // If we stored a pending reference, enforce it to avoid accidental mismatches
    const userSnap = await userRef.get();
    const user = userSnap.data() || {};
    const pendingRef = user.pendingPaystackReference as string | undefined;

    if (pendingRef && refFromPaystack && pendingRef !== refFromPaystack) {
      // Not the transaction we created for upgrade; ignore
      return ok();
    }

    const planToUse = isValidPlan(selectedPlan) ? selectedPlan : (user.plan as string) || "starter";

    await activatePlan(planToUse, {
      customer_code: data?.customer?.customer_code || null,
      authorization: data?.authorization || null,
    });

    return ok();
  }

  // --- Optional: subscription.create (not always present/reliable for first unlock) ---
  if (eventType === "subscription.create") {
    const uid = data?.metadata?.uid as string | undefined;
    if (!uid) return ok(); // ignore safely

    const userRef = admin.firestore().doc(`users/${uid}`);

    // Helper: activate plan safely
    const activatePlan = async (planToUse: string, extraPaystack?: Record<string, any>) => {
      await userRef.set(
        {
          plan: planToUse,
          subscriptionStatus: "active",
          applicationsUsedThisMonth: 0,
          pendingPlan: admin.firestore.FieldValue.delete(),
          pendingPaystackReference: admin.firestore.FieldValue.delete(),
          pendingCreatedAt: admin.firestore.FieldValue.delete(),
          paystack: {
            ...(extraPaystack || {}),
            lastEvent: eventType,
            lastReference: data?.reference || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    };

    const selectedPlan = data?.metadata?.selectedPlan;
    const planToUse = isValidPlan(selectedPlan) ? selectedPlan : "starter";

    await activatePlan(planToUse, {
      subscription_code: data?.subscription_code || null,
      email_token: data?.email_token || null,
      customer_code: data?.customer?.customer_code || null,
    });

    return ok();
  }

  // --- Renewal/invoice events (keep active + reset monthly usage) ---
  if (eventType === "invoice.update") {
    const uid = data?.metadata?.uid as string | undefined;
    if (!uid) return ok();

    const userRef = admin.firestore().doc(`users/${uid}`);

    // Only keep active if Paystack indicates a successful state (varies by payload)
    // If you want stricter logic, we can check data.status fields here.
    const userSnap = await userRef.get();
    const currentPlan = (userSnap.data()?.plan as string) || "starter";

    await userRef.set(
      {
        subscriptionStatus: "active",
        plan: currentPlan,
        applicationsUsedThisMonth: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return ok();
  }

  if (eventType === "invoice.payment_failed") {
    const uid = data?.metadata?.uid as string | undefined;
    if (!uid) return ok();

    const userRef = admin.firestore().doc(`users/${uid}`);

    await userRef.set(
      {
        subscriptionStatus: "past_due",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return ok();
  }

  if (eventType === "subscription.disable") {
    const uid = data?.metadata?.uid as string | undefined;
    if (!uid) return ok();

    const userRef = admin.firestore().doc(`users/${uid}`);

    await userRef.set(
      {
        subscriptionStatus: "cancelled",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return ok();
  }

  return ok();
};
