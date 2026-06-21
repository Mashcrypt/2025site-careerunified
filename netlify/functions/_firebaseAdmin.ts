// netlify/functions/_firebaseAdmin.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function ensureApp() {
  if (!getApps().length) {
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_CLIENT_EMAIL ||
      !process.env.FIREBASE_PRIVATE_KEY
    ) {
      throw new Error(
        "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
      );
    }

    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }
}

const firestore = Object.assign(() => {
  ensureApp();
  return getFirestore();
}, { FieldValue, Timestamp });

const adminCompat = {
  auth() {
    ensureApp();
    return getAuth();
  },
  firestore,
  storage() {
    ensureApp();
    return getStorage();
  },
};

export function getAdmin() {
  ensureApp();
  return adminCompat;
}

export function getDb() {
  return getAdmin().firestore();
}
