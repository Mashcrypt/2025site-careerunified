import type { Handler } from "@netlify/functions";
import { getAdmin } from "./_firebaseAdmin";

type ResumeData = {
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    website?: string;
    summary: string;
  };
  experience: Array<{
    id: string;
    position: string;
    company: string;
    location: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
  }>;
  education: Array<{
    id: string;
    degree: string;
    institution: string;
    location: string;
    graduationDate: string;
    gpa?: string;
  }>;
  skills: string[];
  projects?: Array<{
    id: string;
    name: string;
    description: string;
    technologies: string[];
    link?: string;
  }>;
  certifications?: string[];
};

type TailorMode = "tailor" | "cover_letter";

type TailorRequestBody = {
  mode?: TailorMode;
  resumeData: ResumeData;
  jobDescription: string;
};

type TailorResponse = { suggestions: string[]; tailoredData: ResumeData };
type CoverLetterResponse = { coverLetter: string; talkingPoints: string[] };

function safeJsonParse<T = any>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }
  return null;
}

/**
 * Best-effort repair when the model returns extra text.
 * - Removes leading/trailing non-JSON
 * - Removes trailing commas
 */
function repairJson(text: string): string | null {
  const block = extractJsonBlock(text) ?? text.trim();
  if (!block) return null;

  let cleaned = block;

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  if (!cleaned.startsWith("{") || !cleaned.endsWith("}")) return null;

  return cleaned;
}

function normalizeMode(mode?: string): TailorMode {
  return mode === "cover_letter" ? "cover_letter" : "tailor";
}

function buildPrompts(mode: TailorMode, resumeData: ResumeData, jobDescription: string) {
  if (mode === "cover_letter") {
    const systemRules = `
You are an expert career coach and cover letter writer.

Return ONLY valid JSON (no markdown, no backticks, no explanation).
The JSON must match this shape:

{
  "coverLetter": string,
  "talkingPoints": string[]
}

Rules:
- Keep the user's facts truthful. Do NOT invent companies, degrees, dates, or achievements.
- Use a confident, professional tone.
- Personalize to the job description and align with the resume content.
- 250–450 words total.
- Use simple paragraphs (no fancy formatting).
- talkingPoints: 3–6 short bullet-style lines summarizing the strongest matches.
`.trim();

    const userPrompt = `
JOB DESCRIPTION:
${jobDescription}

RESUME JSON:
${JSON.stringify(resumeData)}

TASK:
Write a tailored cover letter for this job using only the resume facts. Also return 3–6 talkingPoints.
`.trim();

    return { systemRules, userPrompt };
  }

  const systemRules = `
You are an expert resume writer and ATS optimization assistant.

Return ONLY valid JSON (no markdown, no backticks, no explanation).
The JSON must match this shape:

{
  "suggestions": string[],
  "tailoredData": ResumeData
}

Rules:
- Keep the user's facts truthful. Do NOT invent companies, degrees, dates, or achievements.
- You MAY rephrase sentences and reorder content for ATS.
- Add keywords from the job description naturally where relevant.
- Improve clarity and action verbs ONLY if it can be inferred from existing text.
- Keep ResumeData structure identical.
- Maintain all IDs as-is.
`.trim();

  const userPrompt = `
JOB DESCRIPTION:
${jobDescription}

CURRENT RESUME JSON:
${JSON.stringify(resumeData)}

TASK:
1) Generate 4–8 short suggestions describing what you changed.
2) Output tailoredData optimized for this job description.
`.trim();

  return { systemRules, userPrompt };
}

function planLimit(plan: string) {
  if (plan === "starter") return 5;
  if (plan === "job_seeker") return 20;
  if (plan === "career_pro") return Number.POSITIVE_INFINITY;
  return 0; // free
}

function corsHeaders(origin?: string) {
  // Set ALLOWED_ORIGIN=https://careerunified.com (or https://www.careerunified.com) in Netlify env to lock it down
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin":
      allowed === "*"
        ? "*"
        : origin && origin === allowed
        ? origin
        : allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(statusCode: number, body: any, extraHeaders?: Record<string, string>) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };
}

function decodeBody(eventBody: string | null | undefined, isB64?: boolean) {
  if (!eventBody) return "";
  if (!isB64) return eventBody;
  try {
    return Buffer.from(eventBody, "base64").toString("utf8");
  } catch {
    return eventBody;
  }
}

function validateResumeShape(data: any): data is ResumeData {
  return (
    data &&
    typeof data === "object" &&
    data.personalInfo &&
    typeof data.personalInfo.fullName === "string" &&
    Array.isArray(data.experience) &&
    Array.isArray(data.education) &&
    Array.isArray(data.skills)
  );
}

/**
 * ✅ FIXED Gemini call:
 * - Uses systemInstruction instead of role:"system" in contents
 * - Avoids responseMimeType (breaks some models)
 * - Reads raw error body so your 500 includes the real Gemini error
 */
async function callGemini(params: {
  endpoint: string;
  systemRules: string;
  userPrompt: string;
  temperature: number;
  maxOutputTokens: number;
}) {
  const { endpoint, systemRules, userPrompt, temperature, maxOutputTokens } = params;

  const payload = {
    systemInstruction: {
      role: "system",
      parts: [{ text: systemRules }],
    },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      // responseMimeType: "application/json", // ❗disable for compatibility
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new Error(raw || `Gemini request failed with status ${res.status}`);
  }

  const data = safeJsonParse<any>(raw);
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") || "";

  return text;
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const baseHeaders = corsHeaders(origin);

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: baseHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" }, baseHeaders);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(500, { error: "Missing GEMINI_API_KEY" }, baseHeaders);

  // Auth header
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return json(401, { error: "Missing Authorization Bearer token" }, baseHeaders);

  const admin = getAdmin();

  // Verify token
  let uid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return json(401, { error: "Invalid or expired token" }, baseHeaders);
  }

  // Body
  const rawBody = decodeBody(event.body, event.isBase64Encoded);
  const body = safeJsonParse<TailorRequestBody>(rawBody);
  const mode = normalizeMode(body?.mode);

  if (!body?.resumeData || !body?.jobDescription?.trim()) {
    return json(400, { error: "resumeData and jobDescription are required." }, baseHeaders);
  }

  if (!validateResumeShape(body.resumeData)) {
    return json(400, { error: "resumeData shape is invalid." }, baseHeaders);
  }

  // Billing state
  const userRef = admin.firestore().doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const user = userSnap.data() || {};

  const plan = (user.plan as string) || "free";
  const subscriptionStatus = (user.subscriptionStatus as string) || "inactive";
  const used = Number(user.applicationsUsedThisMonth || 0);

  const freeResumeUsed = Boolean(user.freeResumeUsed);
  const freeCoverUsed = Boolean(user.freeCoverUsed);

  const isPaid = plan !== "free" && subscriptionStatus === "active";
  const limit = planLimit(plan);

  const authorization_url =
    (user.authorization_url as string) ||
    (user.checkoutUrl as string) ||
    (process.env.UPGRADE_URL as string) ||
    null;

  // Gate access
  if (!isPaid) {
    if (mode === "tailor" && freeResumeUsed) {
      return json(402, { error: "Free resume tailor already used. Please upgrade.", authorization_url }, baseHeaders);
    }
    if (mode === "cover_letter" && freeCoverUsed) {
      return json(402, { error: "Free cover letter already used. Please upgrade.", authorization_url }, baseHeaders);
    }
  } else {
    if (used >= limit) {
      return json(402, { error: "Monthly limit reached. Upgrade your plan to continue.", authorization_url }, baseHeaders);
    }
  }

  // Gemini endpoint
  // If this model ever fails due to availability, switch to gemini-1.5-flash
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;

  const { systemRules, userPrompt } = buildPrompts(mode, body.resumeData, body.jobDescription);

  // Call Gemini with retry/fallback
  let text = "";
  try {
    text = await callGemini({
      endpoint,
      systemRules,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 1700,
    });
  } catch (e1: any) {
    try {
      text = await callGemini({
        endpoint,
        systemRules,
        userPrompt,
        temperature: 0.1,
        maxOutputTokens: 1700,
      });
    } catch (e2: any) {
      return json(
        500,
        { error: "Gemini request failed.", details: String(e2?.message || e2) },
        baseHeaders
      );
    }
  }

  // Parse
  const jsonCandidate = extractJsonBlock(text) ?? text.trim();
  let parsed = safeJsonParse<any>(jsonCandidate);

  // Repair fallback if needed
  if (!parsed) {
    const repaired = repairJson(text);
    if (repaired) parsed = safeJsonParse<any>(repaired);
  }

  // Validate + update usage ONLY after success
  if (mode === "cover_letter") {
    const typed = parsed as CoverLetterResponse;

    if (!typed?.coverLetter || !Array.isArray(typed?.talkingPoints)) {
      return json(
        500,
        { error: "Could not parse Gemini JSON response (cover_letter).", raw: text.slice(0, 4000) },
        baseHeaders
      );
    }

    // Usage update
    if (!isPaid) {
      await userRef.set(
        { freeCoverUsed: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    } else {
      await userRef.set(
        {
          applicationsUsedThisMonth: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return json(200, typed, baseHeaders);
  }

  const typed = parsed as TailorResponse;

  if (!typed?.tailoredData || !Array.isArray(typed?.suggestions)) {
    return json(
      500,
      { error: "Could not parse Gemini JSON response (tailor).", raw: text.slice(0, 4000) },
      baseHeaders
    );
  }

  // Extra safety: ensure we didn’t lose structure
  if (!validateResumeShape(typed.tailoredData)) {
    return json(
      500,
      { error: "Gemini returned invalid tailoredData shape.", raw: text.slice(0, 4000) },
      baseHeaders
    );
  }

  // Usage update
  if (!isPaid) {
    await userRef.set(
      { freeResumeUsed: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  } else {
    await userRef.set(
      {
        applicationsUsedThisMonth: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return json(200, typed, baseHeaders);
};
