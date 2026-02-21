import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { getAdmin } from "./_firebaseAdmin";

function ok() {
  return { statusCode: 200, body: "ok" };
}

function bad(statusCode: number, msg: string) {
  return { statusCode, body: msg };
}

function verifySignature(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

function limitForPlan(plan: string) {
  if (plan === "starter") return 5;
  if (plan === "job_seeker") return 20;
  if (plan === "career_pro") return Infinity;
  return 0;
}

export const handler: Handler = async (event) => {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) return bad(500, "Missing PAYSTACK_SECRET_KEY");

  const rawBody = event.body || "";
  const signature =
    (event.headers["x-paystack-signature"] as string) ||
    (event.headers["X-Paystack-Signature"] as string);

  // Verify origin :contentReference[oaicite:8]{index=8}
  if (!verifySignature(rawBody, signature, paystackSecret)) {
    return bad(401, "Invalid signature");
  }

  const payload = JSON.parse(rawBody || "{}");
  const eventType = payload?.event as string;
  const data = payload?.data || {};

  // We rely on metadata.uid from the initial transaction initialize
  const uid = data?.metadata?.uid as string | undefined;

  // Some events may not include metadata consistently; if uid missing, ignore safely.
  if (!uid) return ok();

  const admin = getAdmin();
  const userRef = admin.firestore().doc(`users/${uid}`);

  // Events list & billing flow guidance :contentReference[oaicite:9]{index=9}
  if (eventType === "subscription.create") {
    // Subscription was created (after first payment)
    const selectedPlan = data?.metadata?.selectedPlan || "starter";
    await userRef.set(
      {
        plan: selectedPlan,
        subscriptionStatus: "active",
        paystack: {
          subscription_code: data?.subscription_code || null,
          customer_code: data?.customer?.customer_code || null,
        },
        // reset monthly usage at subscription start
        applicationsUsedThisMonth: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return ok();
  }

  if (eventType === "charge.success" || eventType === "invoice.update") {
    // Payment succeeded (initial or renewal)
    const selectedPlan = data?.metadata?.selectedPlan;

    // If metadata isn’t present on renewals, keep existing plan.
    const userSnap = await userRef.get();
    const currentPlan = (userSnap.data()?.plan as string) || "starter";
    const planToUse = (selectedPlan as string) || currentPlan;

    await userRef.set(
      {
        plan: planToUse,
        subscriptionStatus: "active",
        // Renewals: reset monthly usage counter
        applicationsUsedThisMonth: 0,
        // free taste flags stay; we don’t touch them here
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
