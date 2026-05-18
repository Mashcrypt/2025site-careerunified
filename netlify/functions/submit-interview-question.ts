import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit, clientIpFromHeaders } from "./_rateLimit";

const COLLECTION = "interviewQuestions";

function parseBody(event: any) {
  const contentType = String(event.headers?.["content-type"] || event.headers?.["Content-Type"] || "");
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  if (contentType.includes("application/json")) return JSON.parse(raw || "{}");
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function clean(value: unknown, max = 600) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function handler(event: any) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const admin = getAdmin();
    const rateLimit = await checkRateLimit({
      admin,
      action: "interview-question-submit",
      identifier: `ip:${clientIpFromHeaders(event.headers)}`,
      limit: 5,
      windowSeconds: 60 * 60,
    });

    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rateLimit.retryAfterSeconds) },
        body: JSON.stringify({ error: "Too many submissions. Please try again later." }),
      };
    }

    const body = parseBody(event);
    if (clean(body["bot-field"], 20)) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    const contributorName = clean(body.contributor_name, 80) || "Anonymous";
    const company = clean(body.company, 120);
    const role = clean(body.role, 140);
    const category = clean(body.category, 60) || "General";
    const interviewYear = clean(body.interview_year, 4);
    const questions = clean(body.questions, 2500);
    const preparationTip = clean(body.preparation_tip, 1200);

    if (!company || !role || !questions) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Company, role, and questions are required." }),
      };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = await admin.firestore().collection(COLLECTION).add({
      contributorName: body.post_as_anonymous ? "Anonymous" : contributorName,
      postAsAnonymous: Boolean(body.post_as_anonymous),
      company,
      role,
      category,
      interviewYear,
      questions,
      preparationTip,
      status: "pending",
      helpful: 0,
      notHelpful: 0,
      reports: 0,
      submittedAt: now,
      updatedAt: now,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, id: docRef.id }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error?.message || "Submission failed" }),
    };
  }
}
