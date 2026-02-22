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

  return json;
}

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env var");

  const sa = parseServiceAccount(raw);

  // Netlify often stores private_key with literal "\n"
  if (typeof sa.private_key === "string") {
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  }

  return sa;
}

export function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(getServiceAccount() as any),
    });
  }
  return admin;
}
