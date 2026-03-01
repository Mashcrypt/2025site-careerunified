// netlify/functions/paystack-webhook.ts
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

// ✅ Recruiter plans
function isValidRecruiterPlan(plan: any): plan is "starter" | "pro" | "enterprise" {
  return plan === "starter" || plan === "pro" || plan === "enterprise";
}

type RecruiterPlan = "starter" | "pro" | "enterprise";

const RECRUITER_PLAN_CONFIG: Record<
  RecruiterPlan,
  { amount: number; currency: string; unlocks: number }
> = {
  starter: { amount: 29900, currency: "ZAR", unlocks: 50 },
  pro: { amount: 69900, currency: "ZAR", unlocks: 200 },
  enterprise: { amount: 149900, currency: "ZAR", unlocks: -1 },
};

/**
 * ✅ Find recruiter doc reference from event data.
 * Paystack renewal events often won't include metadata.
 * We try:
 * 1) metadata.recruiterId
 * 2) paystack customer_code match in recruiters collection
 */
async function resolveRecruiterRef(admin: any, data: any) {
  const recruiterId = data?.metadata?.recruiterId as string | undefined;
  if (recruiterId) {
    return admin.firestore().doc(`recruiters/${recruiterId}`);
  }

  const customerCode = data?.customer?.customer_code as string | undefined;
  if (!customerCode) return null;

  const qs = await admin
    .firestore()
    .collection("recruiters")
    .where("paystack.customer_code", "==", customerCode)
    .limit(1)
    .get();

  if (qs.empty) return null;
  return qs.docs[0].ref;
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

  // ============================================================
  // 1) CHARGE.SUCCESS
  // - Primary "first payment" event for both AI and recruiters
  // ============================================================
  if (eventType === "charge.success") {
    // ✅ Recruiter branch (does NOT affect AI)
    const recruiterId = data?.metadata?.recruiterId as string | undefined;
    const recruiterPlan = data?.metadata?.plan as string | undefined;

    if (recruiterId && recruiterPlan) {
      if (!isValidRecruiterPlan(recruiterPlan)) return ok();

      // Validate amount & currency
      const expected = RECRUITER_PLAN_CONFIG[recruiterPlan];
      const txAmount = Number(data?.amount);
      const txCurrency = String(data?.currency || "").toUpperCase();

      if (txCurrency !== expected.currency) return ok();
      if (txAmount !== expected.amount) return ok();

      const recruiterRef = admin.firestore().doc(`recruiters/${recruiterId}`);

      await recruiterRef.set(
        {
          plan: recruiterPlan,
          unlocksRemaining: expected.unlocks,
          totalUnlocks: expected.unlocks,
          subscriptionStatus: "active",
          upgradedAt: new Date().toISOString(),
          paystack: {
            lastEvent: eventType,
            lastReference: data?.reference || null,
            customer_code: data?.customer?.customer_code || null,
            authorization: data?.authorization || null,
            // sometimes present, safe to store:
            subscription_code: data?.subscription?.subscription_code || null,
            plan_code: data?.plan?.plan_code || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return ok();
    }

    // ✅ EXISTING AI PLAN LOGIC (UNCHANGED)
    const uid = data?.metadata?.uid as string | undefined;
    if (!uid) return ok(); // ignore safely

    const userRef = admin.firestore().doc(`users/${uid}`);

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

    const userSnap = await userRef.get();
    const user = userSnap.data() || {};
    const pendingRef = user.pendingPaystackReference as string | undefined;

    if (pendingRef && refFromPaystack && pendingRef !== refFromPaystack) {
      return ok();
    }

    const planToUse = isValidPlan(selectedPlan) ? selectedPlan : (user.plan as string) || "starter";

    await activatePlan(planToUse, {
      customer_code: data?.customer?.customer_code || null,
      authorization: data?.authorization || null,
    });

    return ok();
  }

  // ============================================================
  // 2) SUBSCRIPTION.CREATE (AI only, kept as-is)
  // ============================================================
  if (eventType === "subscription.create") {
    const uid = data?.metadata?.uid as string | undefined;
    if (!uid) return ok();

    const userRef = admin.firestore().doc(`users/${uid}`);

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

  // ============================================================
  // 3) INVOICE.UPDATE (Renewal success)
  // - AI: unchanged
  // - Recruiters: NEW support (activate + optionally reset unlocks)
  // ============================================================
  if (eventType === "invoice.update") {
    // ✅ Recruiter renewal handling
    const recruiterRef = await resolveRecruiterRef(admin, data);
    if (recruiterRef) {
      // Keep subscription active (you can expand with stricter checks later)
      const snap = await recruiterRef.get();
      const existing = snap.data() || {};
      const currentPlan = (existing.plan as RecruiterPlan) || "starter";

      const unlocksToSet =
        currentPlan === "enterprise"
          ? -1
          : RECRUITER_PLAN_CONFIG[currentPlan]?.unlocks ?? existing.unlocksRemaining ?? 0;

      await recruiterRef.set(
        {
          subscriptionStatus: "active",
          // OPTIONAL: reset monthly unlocks on successful renewal
          unlocksRemaining: unlocksToSet,
          totalUnlocks: unlocksToSet,
          paystack: {
            ...(existing.paystack || {}),
            lastEvent: eventType,
            lastReference: data?.reference || null,
            customer_code: data?.customer?.customer_code || existing?.paystack?.customer_code || null,
            subscription_code:
              data?.subscription?.subscription_code || existing?.paystack?.subscription_code || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return ok();
    }

    // ✅ AI unchanged
    const uid = data?.metadata?.uid as string | undefined;
    if (!uid) return ok();

    const userRef = admin.firestore().doc(`users/${uid}`);
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

  // ============================================================
  // 4) INVOICE.PAYMENT_FAILED
  // - AI: unchanged
  // - Recruiters: NEW support
  // ============================================================
  if (eventType === "invoice.payment_failed") {
    const recruiterRef = await resolveRecruiterRef(admin, data);
    if (recruiterRef) {
      await recruiterRef.set(
        {
          subscriptionStatus: "past_due",
          paystack: {
            lastEvent: eventType,
            lastReference: data?.reference || null,
            customer_code: data?.customer?.customer_code || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return ok();
    }

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

  // ============================================================
  // 5) SUBSCRIPTION.DISABLE
  // - AI: unchanged
  // - Recruiters: NEW support
  // ============================================================
  if (eventType === "subscription.disable") {
    const recruiterRef = await resolveRecruiterRef(admin, data);
    if (recruiterRef) {
      await recruiterRef.set(
        {
          subscriptionStatus: "cancelled",
          paystack: {
            lastEvent: eventType,
            lastReference: data?.reference || null,
            customer_code: data?.customer?.customer_code || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return ok();
    }

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
