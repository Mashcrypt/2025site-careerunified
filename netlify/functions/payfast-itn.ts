import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import * as dns from "node:dns/promises";
import { getAdmin } from "./_firebaseAdmin";

type PlanId = "starter" | "job_seeker" | "career_pro";
const PLAN_AMOUNT: Record<PlanId, string> = {
  starter: "28.99",
  job_seeker: "49.00",
  career_pro: "99.00",
};
const AI_CREDIT_PRODUCT = "careerunified-ai-credits";
const AI_CREDIT_PACK_ID = "ai_tailor_10";
const AI_CREDIT_PACK_AMOUNT = 19.00;
const AI_CREDIT_PACK_QUANTITY = 10;
type RecruiterPlanId = "starter" | "pro" | "enterprise";
const RECRUITER_PLAN: Record<RecruiterPlanId, { amount: string; unlocks: number }> = {
  starter: { amount: "299.00", unlocks: 50 },
  pro: { amount: "699.00", unlocks: 200 },
  enterprise: { amount: "1499.00", unlocks: -1 },
};

const PAYFAST_SOURCE_HOSTS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

function ok() {
  return { statusCode: 200, body: "OK" };
}
function bad(statusCode: number, msg: string) {
  return { statusCode, body: msg };
}
function decodeRawBody(event: any) {
  const body = event.body || "";
  if (!body) return "";
  return event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}
function parseBody(rawBody: string) {
  const params = new URLSearchParams(rawBody);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}
function isValidPlan(plan: any): plan is PlanId {
  return plan === "starter" || plan === "job_seeker" || plan === "career_pro";
}
function isRecruiterPlan(plan: any): plan is RecruiterPlanId {
  return plan === "starter" || plan === "pro" || plan === "enterprise";
}
function isAiCreditPack(value: any): value is typeof AI_CREDIT_PACK_ID {
  return value === AI_CREDIT_PACK_ID;
}
function generateSignature(fields: Record<string, string>, passphrase?: string) {
  const cleaned: Record<string, string> = { ...fields };
  delete cleaned.signature;
  const keys = Object.keys(cleaned).filter((k) => cleaned[k] !== "");
  const payload = keys.map((k) => `${k}=${encodeURIComponent(String(cleaned[k]).trim()).replace(/%20/g, "+")}`).join("&");
  const withPassphrase = passphrase
    ? `${payload}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`
    : payload;
  return crypto.createHash("md5").update(withPassphrase).digest("hex");
}

function encodePayfastValue(value: string) {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function payfastValidateUrl() {
  return process.env.PAYFAST_MODE === "live"
    ? "https://www.payfast.co.za/eng/query/validate"
    : "https://sandbox.payfast.co.za/eng/query/validate";
}

function requestIp(headers: Record<string, string | undefined>) {
  const netlifyIp = headerValue(headers, "x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp.trim();

  const forwarded = headerValue(headers, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return headerValue(headers, "client-ip") || "";
}

function headerValue(headers: Record<string, string | undefined>, name: string) {
  const target = name.toLowerCase();
  const match = Object.keys(headers).find((key) => key.toLowerCase() === target);
  return match ? headers[match] : undefined;
}

function normalizeIp(value?: string | null) {
  return (value || "").trim().replace(/^\[?::ffff:/i, "").replace(/]$/, "");
}

async function resolvePayfastIps(hosts = PAYFAST_SOURCE_HOSTS) {
  const resolved = new Set<string>();
  for (const host of hosts) {
    const records = await dns.lookup(host, { all: true });
    records.forEach((record) => resolved.add(normalizeIp(record.address)));
  }
  return resolved;
}

function referrerHost(headers: Record<string, string | undefined>) {
  const value = headerValue(headers, "referer") || headerValue(headers, "referrer");
  if (!value) return "";

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`https://${value}`).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
}

async function validatePayfastSource(headers: Record<string, string | undefined>) {
  const allowedHosts =
    process.env.PAYFAST_MODE === "live"
      ? PAYFAST_SOURCE_HOSTS.filter((host) => host !== "sandbox.payfast.co.za")
      : ["sandbox.payfast.co.za"];
  const validIps = await resolvePayfastIps(allowedHosts);

  const ip = normalizeIp(requestIp(headers));
  if (ip && validIps.has(ip)) {
    return { ok: true, method: "ip", ip };
  }

  // PayFast's own sample validates the Referer host. In serverless environments,
  // proxy headers can hide the original source IP, so accept a valid PayFast
  // referrer as a secondary signal while still requiring signature + server
  // validation below.
  const refererHost = referrerHost(headers);
  if (refererHost && allowedHosts.includes(refererHost)) {
    const refererIps = await resolvePayfastIps([refererHost]);
    if ([...refererIps].some((refererIp) => validIps.has(refererIp))) {
      return { ok: true, method: "referer", ip, refererHost };
    }
  }

  return { ok: false, method: "none", ip, refererHost };
}

async function validateWithPayfast(data: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const payload = Object.entries(data)
      .filter(([key, value]) => key !== "signature" && value !== "")
      .map(([key, value]) => `${key}=${encodePayfastValue(value)}`)
      .join("&");

    const response = await fetch(payfastValidateUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
      signal: controller.signal,
    });

    const text = (await response.text()).trim();
    return { ok: response.ok && text === "VALID", status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

function addBillingPeriod(from = new Date()) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function timestampToDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  return null;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return bad(405, "Method Not Allowed");

  const passphrase = process.env.PAYFAST_PASSPHRASE;
  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  if (!passphrase || !merchantId) return bad(500, "PayFast is not configured");

  const rawBody = decodeRawBody(event);
  const data = parseBody(rawBody);

  if (data.merchant_id && data.merchant_id !== merchantId) return bad(401, "Invalid merchant");

  const expectedSig = generateSignature(data, passphrase);
  if (!data.signature || expectedSig !== data.signature) return bad(401, "Invalid signature");

  let validPayfastSource = { ok: false, method: "none" } as Awaited<ReturnType<typeof validatePayfastSource>>;
  try {
    validPayfastSource = await validatePayfastSource(event.headers as Record<string, string | undefined>);
  } catch (error) {
    console.error("PAYFAST_SOURCE_VALIDATE_ERROR", error);
  }
  if (!validPayfastSource.ok) {
    console.warn("PAYFAST_SOURCE_VALIDATE_WARN", {
      m_payment_id: data.m_payment_id || null,
      pf_payment_id: data.pf_payment_id || null,
      source: validPayfastSource,
    });

    if (process.env.PAYFAST_ENFORCE_SOURCE_IP === "true") {
      return bad(401, "Invalid PayFast source");
    }
  }

  let validPayfastData = { ok: false, status: 0, text: "" };
  try {
    validPayfastData = await validateWithPayfast(data);
  } catch (error) {
    console.error("PAYFAST_VALIDATE_ERROR", error);
  }
  if (!validPayfastData.ok) {
    console.error("PAYFAST_VALIDATE_INVALID", {
      m_payment_id: data.m_payment_id || null,
      pf_payment_id: data.pf_payment_id || null,
      status: validPayfastData.status,
      response: validPayfastData.text,
    });
    return bad(401, "Invalid PayFast data");
  }

  const uid = data.custom_str1;
  const plan = data.custom_str2;
  const product = data.custom_str3 || "careerunified-ai";
  const amount_gross = Number(data.amount_gross || data.amount || "0");
  const payment_status = (data.payment_status || "").toUpperCase();

  if (!uid) return ok();

  const isRecruiterPayment = product === "careerunified-recruiter";
  const isAiCreditPayment = product === AI_CREDIT_PRODUCT;
  if (isAiCreditPayment && !isAiCreditPack(plan)) return ok();
  if (isRecruiterPayment && !isRecruiterPlan(plan)) return ok();
  if (!isRecruiterPayment && !isAiCreditPayment && !isValidPlan(plan)) return ok();

  const expectedAmount = isAiCreditPayment
    ? AI_CREDIT_PACK_AMOUNT
    : Number(isRecruiterPayment ? RECRUITER_PLAN[plan as RecruiterPlanId].amount : PLAN_AMOUNT[plan as PlanId]);
  if (!Number.isFinite(amount_gross) || Math.abs(amount_gross - expectedAmount) > 0.01) {
    return bad(400, "Amount mismatch");
  }

  const admin = getAdmin();
  const db = admin.firestore();
  const paymentId = data.m_payment_id || data.pf_payment_id || `${uid}_${Date.now()}`;
  const paymentRef = db.collection("payfastPayments").doc(String(paymentId));
  const now = new Date();

  if (payment_status !== "COMPLETE") {
    const status = payment_status === "CANCELLED" ? "cancelled" : "past_due";
    const targetRef = isRecruiterPayment ? db.doc(`recruiters/${uid}`) : db.doc(`users/${uid}`);
    if (isAiCreditPayment) {
      await targetRef.set(
        {
          pendingCreditLastFailedStatus: payment_status || null,
          pendingCreditLastFailedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return ok();
    }
    await targetRef.set(
      {
        subscriptionStatus: status,
        payfastLastFailedStatus: payment_status || null,
        payfastLastFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return ok();
  }

  if (isRecruiterPayment) {
    const recruiterPlan = plan as RecruiterPlanId;
    const cfg = RECRUITER_PLAN[recruiterPlan];
    const recruiterRef = db.doc(`recruiters/${uid}`);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(paymentRef);
      if (existing.exists) return;
      const recruiterSnap = await tx.get(recruiterRef);
      const recruiterData = recruiterSnap.data() || {};
      const existingEnd = timestampToDate(recruiterData.subscriptionCurrentPeriodEnd);
      const periodBase = existingEnd && existingEnd > now ? existingEnd : now;
      const periodEnd = addBillingPeriod(periodBase);

      tx.set(
        recruiterRef,
        {
          plan: recruiterPlan,
          subscriptionStatus: "active",
          subscriptionCurrentPeriodStart: admin.firestore.Timestamp.fromDate(now),
          subscriptionCurrentPeriodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
          unlocksRemaining: cfg.unlocks,
          totalUnlocks: cfg.unlocks,
          pendingPlan: admin.firestore.FieldValue.delete(),
          pendingPayfastPaymentId: admin.firestore.FieldValue.delete(),
          pendingCreatedAt: admin.firestore.FieldValue.delete(),
          lastPaymentRef: data.m_payment_id || data.pf_payment_id || null,
          lastPaymentVerifiedAt: new Date().toISOString(),
          payfast: {
            payment_id: data.pf_payment_id || null,
            m_payment_id: data.m_payment_id || null,
            item_name: data.item_name || null,
            amount_gross,
            payment_status,
            token: data.token || null,
            custom_str1: uid,
            custom_str2: recruiterPlan,
            custom_str3: product,
            receivedAt: new Date().toISOString(),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(paymentRef, {
        product,
        uid,
        plan: recruiterPlan,
        amount_gross,
        payment_status,
        pf_payment_id: data.pf_payment_id || null,
        m_payment_id: data.m_payment_id || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return ok();
  }

  const userRef = db.doc(`users/${uid}`);

  if (isAiCreditPayment) {
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(paymentRef);
      if (existing.exists) return;

      tx.set(
        userRef,
        {
          aiTailorCredits: admin.firestore.FieldValue.increment(AI_CREDIT_PACK_QUANTITY),
          totalAiTailorCreditsPurchased: admin.firestore.FieldValue.increment(AI_CREDIT_PACK_QUANTITY),
          pendingCreditPack: admin.firestore.FieldValue.delete(),
          pendingCreditQuantity: admin.firestore.FieldValue.delete(),
          pendingCreditPayfastPaymentId: admin.firestore.FieldValue.delete(),
          pendingCreditCreatedAt: admin.firestore.FieldValue.delete(),
          lastCreditPaymentRef: data.m_payment_id || data.pf_payment_id || null,
          lastCreditPaymentVerifiedAt: new Date().toISOString(),
          payfastCredits: {
            payment_id: data.pf_payment_id || null,
            m_payment_id: data.m_payment_id || null,
            item_name: data.item_name || null,
            amount_gross,
            payment_status,
            custom_str1: uid,
            custom_str2: plan,
            custom_str3: product,
            creditsAdded: AI_CREDIT_PACK_QUANTITY,
            receivedAt: new Date().toISOString(),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(paymentRef, {
        product,
        uid,
        pack: plan,
        creditsAdded: AI_CREDIT_PACK_QUANTITY,
        amount_gross,
        payment_status,
        pf_payment_id: data.pf_payment_id || null,
        m_payment_id: data.m_payment_id || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return ok();
  }

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(paymentRef);
    if (existing.exists) return;

    const userSnap = await tx.get(userRef);
    const userData = userSnap.data() || {};
    const existingEnd = timestampToDate(userData.subscriptionCurrentPeriodEnd);
    const periodBase = existingEnd && existingEnd > now ? existingEnd : now;
    const periodEnd = addBillingPeriod(periodBase);

    tx.set(
      userRef,
      {
        plan,
        subscriptionStatus: "active",
        subscriptionCurrentPeriodStart: admin.firestore.Timestamp.fromDate(now),
        subscriptionCurrentPeriodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
        applicationsUsedThisMonth: 0,
        pendingPlan: admin.firestore.FieldValue.delete(),
        pendingPayfastPaymentId: admin.firestore.FieldValue.delete(),
        pendingCreatedAt: admin.firestore.FieldValue.delete(),
        payfast: {
          payment_id: data.pf_payment_id || null,
          m_payment_id: data.m_payment_id || null,
          item_name: data.item_name || null,
          amount_gross,
          payment_status,
          token: data.token || null,
          custom_str1: uid,
          custom_str2: plan,
          custom_str3: product,
          subscriptionCurrentPeriodEnd: periodEnd.toISOString(),
          receivedAt: new Date().toISOString(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(paymentRef, {
      product,
      uid,
      plan,
      amount_gross,
      payment_status,
      pf_payment_id: data.pf_payment_id || null,
      m_payment_id: data.m_payment_id || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return ok();
};
