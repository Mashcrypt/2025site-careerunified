#!/usr/bin/env node

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

const PLAN_AMOUNT = {
  starter: "28.99",
  job_seeker: "49.00",
  career_pro: "99.00",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[name] = "true";
      continue;
    }
    args[name] = next;
    i += 1;
  }
  return args;
}

function requireArg(args, name) {
  const value = args[name]?.trim();
  if (!value) throw new Error(`Missing required argument: --${name}`);
  return value;
}

function requirePlan(value) {
  if (!Object.hasOwn(PLAN_AMOUNT, value)) {
    throw new Error(`Invalid --plan "${value}". Use starter, job_seeker, or career_pro.`);
  }
  return value;
}

function addBillingPeriod(from) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function parseDateArg(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${value}`);
  return parsed;
}

function initFirebaseAdmin() {
  if (getApps().length) return getFirestore();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
    return getFirestore();
  }

  initializeApp({
    credential: applicationDefault(),
  });
  return getFirestore();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uid = requireArg(args, "uid");
  const plan = requirePlan(requireArg(args, "plan"));
  const paymentId = requireArg(args, "payment-id");
  if (args["confirm-paid"] !== "true") {
    throw new Error("Payment recovery requires --confirm-paid after verifying the transaction in PayFast.");
  }
  const amount = args.amount?.trim() || PLAN_AMOUNT[plan];
  const periodStart = parseDateArg(args["period-start"], new Date());
  const periodEnd = parseDateArg(args["period-end"], addBillingPeriod(periodStart));
  const force = args.force === "true";

  const db = initFirebaseAdmin();
  const userRef = db.doc(`users/${uid}`);
  const payfastPaymentId = args["pf-payment-id"]?.trim() || null;
  const paymentRef = db.collection("payfastPayments").doc((payfastPaymentId || paymentId).replace(/\//g, "_"));
  const checkoutRef = db.collection("payfastCheckouts").doc(paymentId.replace(/\//g, "_"));

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error(`User does not exist: users/${uid}`);
    const user = userSnap.data() || {};

    if (!force && user.pendingPlan !== plan) {
      throw new Error(`Pending plan does not match. Firebase has "${user.pendingPlan || "none"}".`);
    }
    if (!force && user.pendingPayfastPaymentId !== paymentId) {
      throw new Error(
        `Pending payment does not match. Firebase has "${user.pendingPayfastPaymentId || "none"}".`
      );
    }

    tx.set(
      userRef,
      {
        plan,
        subscriptionStatus: "active",
        subscriptionCurrentPeriodStart: Timestamp.fromDate(periodStart),
        subscriptionCurrentPeriodEnd: Timestamp.fromDate(periodEnd),
        applicationsUsedThisMonth: 0,
        pendingPlan: FieldValue.delete(),
        pendingPayfastPaymentId: FieldValue.delete(),
        pendingCreatedAt: FieldValue.delete(),
        lastPaymentRef: payfastPaymentId || paymentId,
        lastPaymentVerifiedAt: new Date().toISOString(),
        payfast: {
          payment_id: payfastPaymentId,
          m_payment_id: paymentId,
          amount_gross: Number(amount),
          payment_status: "COMPLETE",
          custom_str1: uid,
          custom_str2: plan,
          custom_str3: "careerunified-ai",
          recoveredBy: "support-script",
          receivedAt: new Date().toISOString(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      paymentRef,
      {
        product: "careerunified-ai",
        uid,
        plan,
        amount_gross: Number(amount),
        payment_status: "COMPLETE",
        pf_payment_id: payfastPaymentId,
        m_payment_id: paymentId,
        manualRecovery: true,
        createdAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      checkoutRef,
      {
        paymentId,
        uid,
        plan,
        product: "careerunified-ai",
        expectedAmount: Number(amount),
        currency: "ZAR",
        status: "complete",
        lastPaymentStatus: "COMPLETE",
        lastPfPaymentId: payfastPaymentId,
        lastAmountGross: Number(amount),
        manualRecovery: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  console.log(`Activated ${plan} for users/${uid} until ${periodEnd.toISOString()}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
