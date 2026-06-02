#!/usr/bin/env node

import admin from "firebase-admin";

const PLAN_AMOUNT = {
  starter: "29.00",
  job_seeker: "69.00",
  career_pro: "149.00",
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
  if (admin.apps.length) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
    return admin;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  return admin;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uid = requireArg(args, "uid");
  const plan = requirePlan(requireArg(args, "plan"));
  const paymentId = requireArg(args, "payment-id");
  const amount = args.amount?.trim() || PLAN_AMOUNT[plan];
  const periodStart = parseDateArg(args["period-start"], new Date());
  const periodEnd = parseDateArg(args["period-end"], addBillingPeriod(periodStart));

  const app = initFirebaseAdmin();
  const db = app.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paymentRef = db.collection("payfastPayments").doc(paymentId);

  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        plan,
        subscriptionStatus: "active",
        subscriptionCurrentPeriodStart: admin.firestore.Timestamp.fromDate(periodStart),
        subscriptionCurrentPeriodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
        applicationsUsedThisMonth: 0,
        pendingPlan: admin.firestore.FieldValue.delete(),
        pendingPayfastPaymentId: admin.firestore.FieldValue.delete(),
        pendingCreatedAt: admin.firestore.FieldValue.delete(),
        lastPaymentRef: paymentId,
        payfast: {
          payment_id: args["pf-payment-id"]?.trim() || null,
          m_payment_id: paymentId,
          amount_gross: Number(amount),
          payment_status: "COMPLETE",
          custom_str1: uid,
          custom_str2: plan,
          custom_str3: "careerunified-ai",
          recoveredBy: "support-script",
          receivedAt: new Date().toISOString(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        pf_payment_id: args["pf-payment-id"]?.trim() || null,
        m_payment_id: paymentId,
        manualRecovery: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
