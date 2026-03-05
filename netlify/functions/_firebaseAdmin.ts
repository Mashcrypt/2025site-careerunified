// netlify/functions/_firebaseAdmin.ts
import admin from "firebase-admin";

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function parseServiceAccount(raw: string): ServiceAccount {
  // If someone pasted it with wrapping quotes, remove them
  const trimmed = raw.trim().replace(/^"|"$/g, "");

  // Try JSON first
  const json = (() => {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  })();

  // If not JSON, try base64 JSON
  if (!json) {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON (or base64 JSON).");
    }
  }

  return json as ServiceAccount;
}

function getServiceAccountFromSingleVar(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  const sa = parseServiceAccount(raw);

  // Netlify often stores private_key with literal "\n"
  if (typeof sa.private_key === "string") {
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  }

  return sa;
}

function getServiceAccountFromSplitVars(): ServiceAccount | null {
  const project_id = process.env.FIREBASE_PROJECT_ID;
  const client_email = process.env.FIREBASE_CLIENT_EMAIL;
  let private_key = process.env.FIREBASE_PRIVATE_KEY;

  if (!project_id || !client_email || !private_key) return null;

  // Netlify often stores private_key with literal "\n"
  private_key = private_key.replace(/\\n/g, "\n");

  return { project_id, client_email, private_key };
}

function getServiceAccount(): ServiceAccount {
  // Prefer the single JSON var if present (keeps your old setup working)
  const sa1 = getServiceAccountFromSingleVar();
  if (sa1) return sa1;

  // Fallback to split vars (supports your new setup)
  const sa2 = getServiceAccountFromSplitVars();
  if (sa2) return sa2;

  throw new Error(
    "Missing Firebase Admin credentials. Provide FIREBASE_SERVICE_ACCOUNT (JSON/base64) OR FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY."
  );
}

export function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(getServiceAccount() as any),
    });
  }
  return admin;
}

// ✅ New helper (used by daily-job-draft / approve-draft)
export function getDb() {
  return getAdmin().firestore();
}
