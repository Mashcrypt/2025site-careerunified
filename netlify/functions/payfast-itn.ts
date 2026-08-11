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
const RECRUITER_SINGLE_JOB_PRODUCT = "careerunified-recruiter-single-job";
const RECRUITER_SINGLE_JOB_PACK_ID = "single_job_30";
const RECRUITER_SINGLE_JOB_AMOUNT = 199.00;

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
function isRecruiterSingleJobPack(value: any): value is typeof RECRUITER_SINGLE_JOB_PACK_ID {
  return value === RECRUITER_SINGLE_JOB_PACK_ID;
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

function signaturesMatch(expected: string, received?: string) {
  if (!received || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function safeDocumentId(value: string) {
  return value.replace(/\//g, "_");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
    return {
      ok: response.ok && text.toUpperCase() === "VALID",
      transient: response.status === 429 || response.status >= 500,
      status: response.status,
      text,
    };
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
  let paymentContext: Record<string, string | null> = {
    m_payment_id: null,
    pf_payment_id: null,
  };

  try {
    if (event.httpMethod !== "POST") return bad(405, "Method Not Allowed");

    const passphrase = process.env.PAYFAST_PASSPHRASE;
    const merchantId = process.env.PAYFAST_MERCHANT_ID;
    if (!passphrase || !merchantId) return bad(500, "PayFast is not configured");

    const rawBody = decodeRawBody(event);
    const data = parseBody(rawBody);
    paymentContext = {
      m_payment_id: data.m_payment_id || null,
      pf_payment_id: data.pf_payment_id || null,
    };

    if (data.merchant_id && data.merchant_id !== merchantId) return bad(401, "Invalid merchant");

    const expectedSig = generateSignature(data, passphrase);
    if (!signaturesMatch(expectedSig, data.signature)) return bad(401, "Invalid signature");

  if (process.env.PAYFAST_ENFORCE_SOURCE_IP === "true") {
    let validPayfastSource: Awaited<ReturnType<typeof validatePayfastSource>>;
    try {
      validPayfastSource = await validatePayfastSource(event.headers as Record<string, string | undefined>);
    } catch (error) {
      console.error("PAYFAST_SOURCE_VALIDATE_ERROR", {
        ...paymentContext,
        message: errorMessage(error),
      });
      return bad(503, "PayFast source validation temporarily unavailable");
    }

    if (!validPayfastSource.ok) {
      console.warn("PAYFAST_SOURCE_VALIDATE_INVALID", {
        ...paymentContext,
        source: validPayfastSource,
      });
      return bad(401, "Invalid PayFast source");
    }
  }

  let validPayfastData: Awaited<ReturnType<typeof validateWithPayfast>>;
  try {
    validPayfastData = await validateWithPayfast(data);
  } catch (error) {
    console.error("PAYFAST_VALIDATE_ERROR", {
      ...paymentContext,
      message: errorMessage(error),
    });
    return bad(503, "PayFast validation temporarily unavailable");
  }
  if (!validPayfastData.ok) {
    console.error("PAYFAST_VALIDATE_INVALID", {
      ...paymentContext,
      status: validPayfastData.status,
      response: validPayfastData.text,
    });
    return bad(
      validPayfastData.transient ? 503 : 401,
      validPayfastData.transient ? "PayFast validation temporarily unavailable" : "Invalid PayFast data"
    );
  }

  const admin = getAdmin();
  const db = admin.firestore();
  const merchantPaymentId = data.m_payment_id || "";
  const checkoutRef = merchantPaymentId
    ? db.collection("payfastCheckouts").doc(safeDocumentId(merchantPaymentId))
    : null;
  const checkoutSnap = checkoutRef ? await checkoutRef.get() : null;
  const checkout = checkoutSnap?.data() || null;

  const uid = data.custom_str1 || String(checkout?.uid || "");
  const plan = data.custom_str2 || String(checkout?.plan || "");
  const product = data.custom_str3 || String(checkout?.product || "careerunified-ai");
  const amount_gross = Number(data.amount_gross || data.amount || "0");
  const payment_status = (data.payment_status || "").toUpperCase();

  if (!uid) {
    console.error("PAYFAST_ITN_MISSING_UID", paymentContext);
    return bad(400, "Missing payment owner");
  }

  if (
    checkout &&
    (String(checkout.uid || "") !== uid ||
      String(checkout.plan || "") !== plan ||
      String(checkout.product || "") !== product)
  ) {
    console.error("PAYFAST_ITN_CHECKOUT_MISMATCH", {
      ...paymentContext,
      uidMatches: String(checkout.uid || "") === uid,
      planMatches: String(checkout.plan || "") === plan,
      productMatches: String(checkout.product || "") === product,
    });
    return bad(400, "Payment details do not match checkout");
  }

  const isRecruiterPayment = product === "careerunified-recruiter";
  const isRecruiterSingleJobPayment = product === RECRUITER_SINGLE_JOB_PRODUCT;
  const isAiCreditPayment = product === AI_CREDIT_PRODUCT;
  if (isAiCreditPayment && !isAiCreditPack(plan)) return bad(400, "Invalid AI credit pack");
  if (isRecruiterPayment && !isRecruiterPlan(plan)) return bad(400, "Invalid recruiter plan");
  if (isRecruiterSingleJobPayment && !isRecruiterSingleJobPack(plan)) {
    return bad(400, "Invalid recruiter job pack");
  }
  if (!isRecruiterPayment && !isRecruiterSingleJobPayment && !isAiCreditPayment && !isValidPlan(plan)) {
    return bad(400, "Invalid subscription plan");
  }

  const configuredExpectedAmount = isAiCreditPayment
    ? AI_CREDIT_PACK_AMOUNT
    : isRecruiterSingleJobPayment
      ? RECRUITER_SINGLE_JOB_AMOUNT
      : Number(isRecruiterPayment ? RECRUITER_PLAN[plan as RecruiterPlanId].amount : PLAN_AMOUNT[plan as PlanId]);
  const checkoutExpectedAmount = Number(checkout?.expectedAmount);
  const expectedAmount = Number.isFinite(checkoutExpectedAmount) && checkoutExpectedAmount > 0
    ? checkoutExpectedAmount
    : configuredExpectedAmount;
  if (!Number.isFinite(amount_gross) || Math.abs(amount_gross - expectedAmount) > 0.01) {
    console.error("PAYFAST_ITN_AMOUNT_MISMATCH", {
      ...paymentContext,
      expectedAmount,
      amount_gross,
    });
    return bad(400, "Amount mismatch");
  }

  const paymentId = data.pf_payment_id || data.m_payment_id || `${uid}_${Date.now()}`;
  const paymentRef = db.collection("payfastPayments").doc(safeDocumentId(String(paymentId)));
  const now = new Date();

  console.info("PAYFAST_ITN_VERIFIED", {
    ...paymentContext,
    product,
    plan,
    payment_status,
    hasCheckout: Boolean(checkout),
  });

  if (payment_status !== "COMPLETE") {
    const isFinalFailure = payment_status === "FAILED" || payment_status === "CANCELLED";
    const targetRef = isRecruiterPayment || isRecruiterSingleJobPayment
      ? db.doc(`recruiters/${uid}`)
      : db.doc(`users/${uid}`);
    const targetUpdate: Record<string, any> = {
      payfastLastStatus: payment_status || "UNKNOWN",
      payfastLastStatusAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (isAiCreditPayment) {
      if (isFinalFailure) {
        targetUpdate.pendingCreditLastFailedStatus = payment_status;
        targetUpdate.pendingCreditLastFailedAt = admin.firestore.FieldValue.serverTimestamp();
      }
    } else if (isRecruiterSingleJobPayment) {
      if (isFinalFailure) {
        targetUpdate.pendingSingleJobPack = admin.firestore.FieldValue.delete();
        targetUpdate.pendingSingleJobPayfastPaymentId = admin.firestore.FieldValue.delete();
        targetUpdate.pendingSingleJobCreatedAt = admin.firestore.FieldValue.delete();
        targetUpdate.pendingSingleJobLastFailedStatus = payment_status;
        targetUpdate.pendingSingleJobLastFailedAt = admin.firestore.FieldValue.serverTimestamp();
      }
    } else if (isFinalFailure) {
      targetUpdate.subscriptionStatus = payment_status === "CANCELLED" ? "cancelled" : "past_due";
      targetUpdate.payfastLastFailedStatus = payment_status;
      targetUpdate.payfastLastFailedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    const batch = db.batch();
    batch.set(targetRef, targetUpdate, { merge: true });
    batch.set(
      paymentRef,
      {
        product,
        uid,
        plan,
        amount_gross,
        payment_status: payment_status || "UNKNOWN",
        pf_payment_id: data.pf_payment_id || null,
        m_payment_id: data.m_payment_id || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    if (checkoutRef) {
      batch.set(
        checkoutRef,
        {
          status: (payment_status || "unknown").toLowerCase(),
          lastPaymentStatus: payment_status || "UNKNOWN",
          lastPfPaymentId: data.pf_payment_id || null,
          lastAmountGross: amount_gross,
          lastItnAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();

    console.info("PAYFAST_ITN_STATUS_RECORDED", {
      ...paymentContext,
      payment_status: payment_status || "UNKNOWN",
      final: isFinalFailure,
    });
    return ok();
  }

  if (isRecruiterSingleJobPayment) {
    const recruiterRef = db.doc(`recruiters/${uid}`);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(paymentRef);
      if (existing.exists && String(existing.data()?.payment_status || "").toUpperCase() === "COMPLETE") {
        return;
      }

      tx.set(
        recruiterRef,
        {
          singleJobCredits: admin.firestore.FieldValue.increment(1),
          pendingSingleJobPack: admin.firestore.FieldValue.delete(),
          pendingSingleJobPayfastPaymentId: admin.firestore.FieldValue.delete(),
          pendingSingleJobCreatedAt: admin.firestore.FieldValue.delete(),
          lastSingleJobPaymentRef: data.pf_payment_id || data.m_payment_id || null,
          lastSingleJobPaymentVerifiedAt: new Date().toISOString(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        paymentRef,
        {
          product,
          uid,
          pack: RECRUITER_SINGLE_JOB_PACK_ID,
          quantity: 1,
          amount_gross,
          payment_status,
          pf_payment_id: data.pf_payment_id || null,
          m_payment_id: data.m_payment_id || null,
          createdAt: existing.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (checkoutRef) {
        tx.set(
          checkoutRef,
          {
            status: "complete",
            lastPaymentStatus: payment_status,
            lastPfPaymentId: data.pf_payment_id || null,
            lastAmountGross: amount_gross,
            lastItnAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });
    console.info("PAYFAST_ITN_APPLIED", { ...paymentContext, product, plan });
    return ok();
  }

  if (isRecruiterPayment) {
    const recruiterPlan = plan as RecruiterPlanId;
    const cfg = RECRUITER_PLAN[recruiterPlan];
    const recruiterRef = db.doc(`recruiters/${uid}`);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(paymentRef);
      if (existing.exists && String(existing.data()?.payment_status || "").toUpperCase() === "COMPLETE") {
        return;
      }
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
          lastPaymentRef: data.pf_payment_id || data.m_payment_id || null,
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

      tx.set(
        paymentRef,
        {
          product,
          uid,
          plan: recruiterPlan,
          amount_gross,
          payment_status,
          pf_payment_id: data.pf_payment_id || null,
          m_payment_id: data.m_payment_id || null,
          createdAt: existing.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (checkoutRef) {
        tx.set(
          checkoutRef,
          {
            status: "complete",
            lastPaymentStatus: payment_status,
            lastPfPaymentId: data.pf_payment_id || null,
            lastAmountGross: amount_gross,
            lastItnAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    console.info("PAYFAST_ITN_APPLIED", { ...paymentContext, product, plan });
    return ok();
  }

  const userRef = db.doc(`users/${uid}`);

  if (isAiCreditPayment) {
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(paymentRef);
      if (existing.exists && String(existing.data()?.payment_status || "").toUpperCase() === "COMPLETE") {
        return;
      }

      tx.set(
        userRef,
        {
          aiTailorCredits: admin.firestore.FieldValue.increment(AI_CREDIT_PACK_QUANTITY),
          totalAiTailorCreditsPurchased: admin.firestore.FieldValue.increment(AI_CREDIT_PACK_QUANTITY),
          pendingCreditPack: admin.firestore.FieldValue.delete(),
          pendingCreditQuantity: admin.firestore.FieldValue.delete(),
          pendingCreditPayfastPaymentId: admin.firestore.FieldValue.delete(),
          pendingCreditCreatedAt: admin.firestore.FieldValue.delete(),
          lastCreditPaymentRef: data.pf_payment_id || data.m_payment_id || null,
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

      tx.set(
        paymentRef,
        {
          product,
          uid,
          pack: plan,
          creditsAdded: AI_CREDIT_PACK_QUANTITY,
          item_name: data.item_name || null,
          amount_gross,
          payment_status,
          pf_payment_id: data.pf_payment_id || null,
          m_payment_id: data.m_payment_id || null,
          createdAt: existing.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (checkoutRef) {
        tx.set(
          checkoutRef,
          {
            status: "complete",
            lastPaymentStatus: payment_status,
            lastPfPaymentId: data.pf_payment_id || null,
            lastAmountGross: amount_gross,
            lastItnAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    console.info("PAYFAST_ITN_APPLIED", { ...paymentContext, product, plan });
    return ok();
  }

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(paymentRef);
    if (existing.exists && String(existing.data()?.payment_status || "").toUpperCase() === "COMPLETE") {
      return;
    }

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
        lastPaymentRef: data.pf_payment_id || data.m_payment_id || null,
        lastPaymentVerifiedAt: new Date().toISOString(),
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

    tx.set(
      paymentRef,
      {
        product,
        uid,
        plan,
        amount_gross,
        payment_status,
        pf_payment_id: data.pf_payment_id || null,
        m_payment_id: data.m_payment_id || null,
        createdAt: existing.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (checkoutRef) {
      tx.set(
        checkoutRef,
        {
          status: "complete",
          lastPaymentStatus: payment_status,
          lastPfPaymentId: data.pf_payment_id || null,
          lastAmountGross: amount_gross,
          lastItnAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

    console.info("PAYFAST_ITN_APPLIED", { ...paymentContext, product, plan });
    return ok();
  } catch (error) {
    console.error("PAYFAST_ITN_ERROR", {
      ...paymentContext,
      message: errorMessage(error),
      requestId: event.headers["x-nf-request-id"] || event.headers["X-Nf-Request-Id"] || null,
    });
    return bad(500, "Could not process PayFast notification");
  }
};
