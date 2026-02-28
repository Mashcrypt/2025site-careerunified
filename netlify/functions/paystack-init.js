// netlify/functions/paystack-init.js

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return json(405, { status: false, message: "Method not allowed" });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return json(500, { status: false, message: "Missing PAYSTACK_SECRET_KEY" });
    }

    const body = JSON.parse(event.body || "{}");
    const { plan, recruiterId, email, callbackUrl } = body;

    const PLAN_CONFIG = {
      starter: { amountZAR: 299, unlocks: 50 },
      pro: { amountZAR: 699, unlocks: 200 },
      enterprise: { amountZAR: 1499, unlocks: -1 },
    };

    if (!PLAN_CONFIG[plan]) {
      return json(400, { status: false, message: "Invalid plan" });
    }
    if (!email || !recruiterId) {
      return json(400, { status: false, message: "Missing email or recruiterId" });
    }

    const amount = Math.round(Number(PLAN_CONFIG[plan].amountZAR) * 100); // ZAR cents
    if (!amount || amount < 100) {
      return json(400, { status: false, message: "Invalid amount" });
    }

    // Metadata is how we "remember" what this payment is for
    const payload = {
      email,
      amount: String(amount),
      currency: "ZAR",
      callback_url: callbackUrl,
      metadata: {
        recruiterId,
        plan,
        unlocks: PLAN_CONFIG[plan].unlocks,
        product: "Career Unified Recruiter Subscription"
      }
    };

    const resp = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok || !data?.status) {
      return json(resp.status || 400, {
        status: false,
        message: data?.message || "Paystack initialize failed",
        error: data,
      });
    }

    return json(200, data);

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
