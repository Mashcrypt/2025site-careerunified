import type { Handler } from "@netlify/functions";
import { getAdmin } from "./_firebaseAdmin";

function corsHeaders(origin?: string) {
  const allowed = process.env.ALLOWED_ORIGIN || process.env.SITE_URL || "*";
  const cleanAllowed = allowed.replace(/\/+$/, "");
  const cleanOrigin = origin?.replace(/\/+$/, "");
  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : cleanOrigin === cleanAllowed ? cleanOrigin : cleanAllowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(statusCode: number, body: unknown, headers?: Record<string, string>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body),
  };
}

function timestampToIso(value: any) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  return null;
}

function planLabel(value: unknown) {
  if (value === "starter") return "Starter";
  if (value === "job_seeker") return "Job Hunter";
  if (value === "career_pro") return "Career Pro";
  if (value === "ai_tailor_10") return "10 AI Tailors";
  return "Career Unified payment";
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const baseHeaders = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Method Not Allowed" }, baseHeaders);

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return json(401, { error: "Missing Authorization Bearer token" }, baseHeaders);

  try {
    const admin = getAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const snapshot = await admin
      .firestore()
      .collection("payfastPayments")
      .where("uid", "==", decoded.uid)
      .limit(50)
      .get();

    const records = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const product = String(data.product || "");
        const plan = data.plan || data.pack;
        return {
          id: doc.id,
          date: timestampToIso(data.createdAt),
          plan: planLabel(plan),
          amount: Number(data.amount_gross || 0).toFixed(2),
          status: String(data.payment_status || "").toUpperCase(),
          paymentId: String(data.pf_payment_id || data.m_payment_id || doc.id),
          itemName: String(data.item_name || planLabel(plan)),
          product,
        };
      })
      .filter(
        (record) =>
          record.status === "COMPLETE" &&
          (record.product === "careerunified-ai" || record.product === "careerunified-ai-credits")
      )
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 10);

    return json(200, { records }, baseHeaders);
  } catch (error: any) {
    if (error?.code === "auth/id-token-expired" || error?.code === "auth/argument-error") {
      return json(401, { error: "Invalid or expired token" }, baseHeaders);
    }
    console.error("GET_BILLING_HISTORY_ERROR", error);
    return json(500, { error: "Could not load billing history." }, baseHeaders);
  }
};
