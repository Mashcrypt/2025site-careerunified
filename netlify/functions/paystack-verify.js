// netlify/functions/paystack-verify.js

import { getAdmin } from "./_firebaseAdmin";

export async function handler(event) {
  const headers = corsHeaders(event.headers?.origin);

  try {
    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    // Require auth (Firebase ID token)
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || "";
    const tokenMatch = String(authHeader).match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1];

    if (!idToken) {
      return json(
        401,
        { status: false, message: "Missing Authorization Bearer token" },
        headers
      );
    }

    const admin = getAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);

    if (!decoded?.uid) {
      return json(401, { status: false, message: "Invalid token" }, headers);
    }

    // Must be recruiter
    if (decoded.recruiter !== true) {
      return json(403, { status: false, message: "Recruiter access only" }, headers);
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return json(500, { status: false, message: "Missing PAYSTACK_SECRET_KEY" }, headers);
    }

    // Accept reference from querystring (GET) or JSON body (POST)
    let reference = event.queryStringParameters?.reference || null;

    if (!reference && event.body) {
      try {
        const parsed = JSON.parse(event.body);
        reference = parsed?.reference || null;
      } catch {
        return json(400, { status: false, message: "Invalid JSON body" }, headers);
      }
    }

    if (!reference) {
      return json(400, { status: false, message: "Missing reference" }, headers);
    }

    // Verify with Paystack
    const resp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${secretKey}` },
      }
    );

    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data?.status) {
      return json(
        resp.status || 400,
        {
          status: false,
          message: data?.message || "Paystack verify failed",
          error: data || null,
        },
        headers
      );
    }

    const tx = data.data;

    // Must be success before delivering value
    if (String(tx.status || "").toLowerCase() !== "success") {
      return json(
        200,
        { status: false, message: `Transaction not successful (${tx.status})`, data: tx },
        headers
      );
    }

    // Read metadata
    const plan = tx.metadata?.plan;
    const recruiterId = tx.metadata?.recruiterId;

    const PLAN_CONFIG = {
      starter: { amount: 29900, unlocks: 50, currency: "ZAR" },
      pro: { amount: 69900, unlocks: 200, currency: "ZAR" },
      enterprise: { amount: 149900, unlocks: -1, currency: "ZAR" },
    };

    if (!PLAN_CONFIG[plan]) {
      return json(
        200,
        { status: false, message: "Verified payment but metadata.plan is invalid", data: tx },
        headers
      );
    }

    if (!recruiterId) {
      return json(
        200,
        { status: false, message: "Verified payment but metadata.recruiterId is missing", data: tx },
        headers
      );
    }

    // ✅ Ensure the caller is the same recruiter in metadata
    if (String(recruiterId) !== String(decoded.uid)) {
      return json(
        403,
        { status: false, message: "Recruiter mismatch (token uid != metadata recruiterId)" },
        headers
      );
    }

    // Verify amount & currency to prevent tampering
    if (String(tx.currency || "").toUpperCase() !== PLAN_CONFIG[plan].currency) {
      return json(200, { status: false, message: "Currency mismatch", data: tx }, headers);
    }

    if (Number(tx.amount) !== PLAN_CONFIG[plan].amount) {
      return json(200, { status: false, message: "Amount mismatch", data: tx }, headers);
    }

    const db = admin.firestore();

    // ✅ Prevent double-processing (idempotent)
    const paymentRef = db.collection("paystackPayments").doc(String(tx.reference));
    const recruiterRef = db.collection("recruiters").doc(String(decoded.uid));

    await db.runTransaction(async (t) => {
      const existingPay = await t.get(paymentRef);
      if (existingPay.exists) {
        // already processed
        return;
      }

      const unlocksToSet =
        plan === "enterprise" ? -1 : PLAN_CONFIG[plan].unlocks;

      // Update recruiter subscription server-side
      t.set(
        recruiterRef,
        {
          plan,
          unlocksRemaining: unlocksToSet,
          totalUnlocks: unlocksToSet,
          upgradedAt: new Date().toISOString(),
          lastPaymentRef: tx.reference,
          lastPaymentVerifiedAt: new Date().toISOString(),
          paystackCustomer: tx.customer || null,
          paystackAuthorization: tx.authorization || null,
        },
        { merge: true }
      );

      // Record processed reference (prevents replay)
      t.set(paymentRef, {
        reference: tx.reference,
        recruiterId: decoded.uid,
        plan,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        paidAt: tx.paid_at || null,
        createdAt: new Date().toISOString(),
      });
    });

    return json(
      200,
      {
        status: true,
        message: "Verification successful",
        data: {
          reference: tx.reference,
          plan,
          unlocks: PLAN_CONFIG[plan].unlocks,
          recruiterId: decoded.uid,
        },
      },
      headers
    );
  } catch (err) {
    return json(
      500,
      { status: false, message: "Server error", error: String(err?.message || err) },
      headers
    );
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

function json(statusCode, body, headers) {
  return {
    statusCode,
    headers: headers || corsHeaders(),
    body: JSON.stringify(body),
  };
}
