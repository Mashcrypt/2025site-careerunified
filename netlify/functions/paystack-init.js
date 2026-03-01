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

    // ✅ IMPORTANT:
    // - amount MUST be an INTEGER in the smallest unit (kobo/cents)
    // - Paystack can still use plan for subscription, but amount prevents "invalid amount"
    const PLAN_CONFIG = {
      starter: {
        planCode: "PLN_gzu62x76jlk46ea",
        unlocks: 50,
        amountKobo: 299 * 100,
        label: "STARTER",
      },
      pro: {
        planCode: "PLN_sbhnn6dc1fb2lvb",
        unlocks: 200,
        amountKobo: 699 * 100,
        label: "PRO",
      },
      enterprise: {
        planCode: "PLN_svkkopjlfaq8f3q",
        unlocks: -1,
        amountKobo: 1499 * 100,
        label: "ENTERPRISE",
      },
    };

    const cfg = PLAN_CONFIG[plan];
    if (!cfg) {
      return json(400, { status: false, message: "Invalid plan", received: plan }, headers);
    }

    if (!email || !recruiterId) {
      return json(
        400,
        { status: false, message: "Missing email or recruiterId", received: { email, recruiterId } },
        headers
      );
    }

    // Safe callback fallback (must be a URL)
    const safeCallbackUrl =
      typeof callbackUrl === "string" && callbackUrl.trim()
        ? callbackUrl.trim()
        : "https://careerunified.com/recruiter-dashboard.html";

    // Basic callback sanity: Paystack expects a full URL
    if (!/^https?:\/\//i.test(safeCallbackUrl)) {
      return json(
        400,
        { status: false, message: "callbackUrl must be a full URL", received: safeCallbackUrl },
        headers
      );
    }

    // ✅ HARD VALIDATION: amount must be a positive integer
    if (!Number.isInteger(cfg.amountKobo) || cfg.amountKobo <= 0) {
      return json(
        400,
        {
          status: false,
          message: "Invalid amount configuration for plan",
          plan,
          amountKobo: cfg.amountKobo,
        },
        headers
      );
    }

    // ✅ Send BOTH plan + amount to eliminate "invalid amount" errors
    const payload = {
      email,
      amount: cfg.amountKobo,     // integer in kobo/cents
      currency: "ZAR",            // change only if your Paystack account is NOT ZAR
      plan: cfg.planCode,         // recurring subscription plan code
      callback_url: safeCallbackUrl,
      metadata: {
        recruiterId,
        plan,
        unlocks: cfg.unlocks,
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
      // Return Paystack's message clearly (this will show in your browser console)
      return json(
        resp.status || 400,
        {
          status: false,
          message: data?.message || "Paystack initialize failed",
          paystack: data || null,
          sent: {
            plan,
            planCode: cfg.planCode,
            amount: cfg.amountKobo,
            currency: payload.currency,
            callback_url: safeCallbackUrl,
          },
        },
        headers
      );
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
