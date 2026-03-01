// netlify/functions/paystack-verify.js

export async function handler(event) {
  try {
    const headers = corsHeaders(event.headers?.origin);

    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
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

    const resp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data?.status) {
      return json(resp.status || 400, {
        status: false,
        message: data?.message || "Paystack verify failed",
        error: data || null,
      }, headers);
    }

    const tx = data.data;

    // Must be success before delivering value
    if (String(tx.status || "").toLowerCase() !== "success") {
      return json(200, {
        status: false,
        message: `Transaction not successful (${tx.status})`,
        data: tx,
      }, headers);
    }

    // Validate metadata (what plan is being purchased)
    const plan = tx.metadata?.plan;
    const recruiterId = tx.metadata?.recruiterId;

    const PLAN_CONFIG = {
      starter: { amount: 29900, unlocks: 50, currency: "ZAR" },
      pro: { amount: 69900, unlocks: 200, currency: "ZAR" },
      enterprise: { amount: 149900, unlocks: -1, currency: "ZAR" },
    };

    if (!PLAN_CONFIG[plan]) {
      return json(200, {
        status: false,
        message: "Verified payment but metadata.plan is invalid",
        data: tx,
      }, headers);
    }

    if (!recruiterId) {
      return json(200, {
        status: false,
        message: "Verified payment but metadata.recruiterId is missing",
        data: tx,
      }, headers);
    }

    // Verify amount & currency to prevent tampering
    if (String(tx.currency || "").toUpperCase() !== PLAN_CONFIG[plan].currency) {
      return json(200, { status: false, message: "Currency mismatch", data: tx }, headers);
    }

    if (Number(tx.amount) !== PLAN_CONFIG[plan].amount) {
      return json(200, { status: false, message: "Amount mismatch", data: tx }, headers);
    }

    return json(200, {
      status: true,
      message: "Verification successful",
      data: {
        reference: tx.reference,
        plan,
        unlocks: PLAN_CONFIG[plan].unlocks,
        recruiterId,
      },
    }, headers);
  } catch (err) {
    const headers = corsHeaders();
    return json(500, { status: false, message: "Server error", error: String(err) }, headers);
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
