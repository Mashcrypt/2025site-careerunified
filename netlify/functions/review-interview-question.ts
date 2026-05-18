import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit, clientIpFromHeaders } from "./_rateLimit";

const COLLECTION = "interviewQuestions";
const FALLBACK_ADMIN_UIDS = ["X3eReX1WGpQSR1svO4JIBFDqFUJ3"];

function adminUids() {
  return (process.env.ADMIN_UIDS || process.env.INTERVIEW_ADMIN_UIDS || "")
    .split(",")
    .map((uid) => uid.trim())
    .filter(Boolean)
    .concat(FALLBACK_ADMIN_UIDS);
}

function parseBody(event: any) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

async function verifyAdmin(event: any, admin: any) {
  const header = String(event.headers?.authorization || event.headers?.Authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("Missing admin token");
  const decoded = await admin.auth().verifyIdToken(token);
  if (!adminUids().includes(decoded.uid)) throw new Error("Admin access denied");
  return decoded;
}

function toIso(value: any) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return "";
}

export async function handler(event: any) {
  try {
    const admin = getAdmin();
    const decoded = await verifyAdmin(event, admin);
    const rateLimit = await checkRateLimit({
      admin,
      action: "interview-question-review",
      identifier: `uid:${decoded.uid}:ip:${clientIpFromHeaders(event.headers)}`,
      limit: 120,
      windowSeconds: 60 * 60,
    });

    if (!rateLimit.allowed) {
      return { statusCode: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }, body: "Too many requests" };
    }

    const db = admin.firestore();

    if (event.httpMethod === "GET") {
      const status = event.queryStringParameters?.status || "pending";
      const snap = await db.collection(COLLECTION).where("status", "==", status).limit(100).get();
      const submissions = snap.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data(), submittedAt: toIso(doc.data().submittedAt), approvedAt: toIso(doc.data().approvedAt) }))
        .sort((a: any, b: any) => String(b.submittedAt || b.approvedAt).localeCompare(String(a.submittedAt || a.approvedAt)));
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissions }) };
    }

    if (event.httpMethod === "POST") {
      const { id, action } = parseBody(event);
      if (!id || !["approve", "reject"].includes(action)) {
        return { statusCode: 400, body: "Missing id or action" };
      }

      await db.collection(COLLECTION).doc(id).update({
        status: action === "approve" ? "approved" : "rejected",
        reviewedBy: decoded.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(action === "approve" ? { approvedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      });

      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: "Method not allowed" };
  } catch (error: any) {
    return {
      statusCode: error?.message?.includes("denied") ? 403 : 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error?.message || "Unauthorized" }),
    };
  }
}
