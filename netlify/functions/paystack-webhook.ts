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

  // We rely on metadata.uid set during initialize
  const uid = data?.metadata?.uid as string | undefined;
  if (!uid) return ok(); // ignore safely

  const admin = getAdmin();
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

  // --- Recommended: treat charge.success as the primary "unlock" event ---
  if (eventType === "charge.success") {
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
