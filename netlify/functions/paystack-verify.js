// netlify/functions/paystack-verify.js

export async function handler(event) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return json(500, { status: false, message: "Missing PAYSTACK_SECRET_KEY" });
    }

    const reference =
      event.queryStringParameters?.reference ||
      (event.body ? JSON.parse(event.body).reference : null);

    if (!reference) {
      return json(400, { status: false, message: "Missing reference" });
    }

    const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    const data = await resp.json();

    if (!resp.ok || !data?.status) {
      return json(resp.status || 400, {
        status: false,
        message: data?.message || "Paystack verify failed",
        error: data,
      });
    }

    const tx = data.data;

    // Must be success before delivering value
    if (tx.status !== "success") {
      return json(200, { status: false, message: `Transaction not successful (${tx.status})`, data: tx });
    }

    // Validate metadata (what plan is being purchased)
    const plan = tx.metadata?.plan;
    const unlocks = tx.metadata?.unlocks;

    const PLAN_CONFIG = {
      starter: { amount: 29900, unlocks: 50, currency: "ZAR" },
      pro: { amount: 69900, unlocks: 200, currency: "ZAR" },
      enterprise: { amount: 149900, unlocks: -1, currency: "ZAR" },
    };

    if (!PLAN_CONFIG[plan]) {
      return json(200, { status: false, message: "Verified payment but metadata.plan is invalid", data: tx });
    }

    // Verify amount & currency to prevent tampering
    if (String(tx.currency || "").toUpperCase() !== PLAN_CONFIG[plan].currency) {
      return json(200, { status: false, message: "Currency mismatch", data: tx });
    }

    if (Number(tx.amount) !== PLAN_CONFIG[plan].amount) {
      return json(200, { status: false, message: "Amount mismatch", data: tx });
    }

    return json(200, {
      status: true,
      message: "Verification successful",
      data: {
        reference: tx.reference,
        plan,
        unlocks: PLAN_CONFIG[plan].unlocks
      }
    });

  } catch (err) {
    return json(500, { status: false, message: "Server error", error: String(err) });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}
