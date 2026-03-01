// netlify/functions/paystack-init.js

export async function handler(event) {
  try {
    const headers = corsHeaders(event.headers?.origin);

    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
      return json(405, { status: false, message: "Method not allowed" }, headers);
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return json(500, { status: false, message: "Missing PAYSTACK_SECRET_KEY" }, headers);
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { status: false, message: "Invalid JSON body" }, headers);
    }

    const { plan, recruiterId, email, callbackUrl } = body || {};

    const PLAN_CONFIG = {
      starter: { amountZAR: 299, unlocks: 50 },
      pro: { amountZAR: 699, unlocks: 200 },
      enterprise: { amountZAR: 1499, unlocks: -1 },
    };

    if (!PLAN_CONFIG[plan]) {
      return json(400, { status: false, message: "Invalid plan" }, headers);
    }
    if (!email || !recruiterId) {
      return json(400, { status: false, message: "Missing email or recruiterId" }, headers);
    }

    const amount = Math.round(Number(PLAN_CONFIG[plan].amountZAR) * 100); // ZAR cents
    if (!Number.isFinite(amount) || amount < 100) {
      return json(400, { status: false, message: "Invalid amount" }, headers);
    }

    // Safe callback fallback (must be a URL)
    const safeCallbackUrl =
      typeof callbackUrl === "string" && callbackUrl.trim()
        ? callbackUrl.trim()
        : "https://careerunified.com/recruiter-dashboard.html";

    // Metadata is how we remember what this payment is for
    const payload = {
      email,
      amount, // Paystack accepts integer subunit amount
      currency: "ZAR",
      callback_url: safeCallbackUrl,
      metadata: {
        recruiterId,
        plan,
        unlocks: PLAN_CONFIG[plan].unlocks,
        product: "Career Unified Recruiter Subscription",
      },
    };

    const resp = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data?.status) {
      return json(resp.status || 400, {
        status: false,
        message: data?.message || "Paystack initialize failed",
        error: data || null,
      }, headers);
    }

    return json(200, data, headers);
  } catch (err) {
    const headers = corsHeaders();
    return json(
      500,
      { status: false, message: "Server error", error: String(err?.message || err) },
      headers
    );
  }
}

function corsHeaders(origin) {
  // If you want to lock this down later, replace "*" with your domain.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
