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
  if (firstBrace >= 0 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1).trim();
  return null;
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
1) Generate 4-8 short suggestions describing what you changed.
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

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(500, { error: "Missing GEMINI_API_KEY" });

  // Auth
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return json(401, { error: "Missing Authorization Bearer token" });

  const admin = getAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  const uid = decoded.uid;

  const body = safeJsonParse<TailorRequestBody>(event.body || "");
  const mode = normalizeMode(body?.mode);

  if (!body?.resumeData || !body?.jobDescription?.trim()) {
    return json(400, { error: "resumeData and jobDescription are required." });
  }

  // Load user billing state
  const userRef = admin.firestore().doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const user = userSnap.data() || {};

  const plan = (user.plan as string) || "free";
  const status = (user.subscriptionStatus as string) || "active"; // free users considered "active" for usage
  const used = Number(user.applicationsUsedThisMonth || 0);

  const freeResumeUsed = Boolean(user.freeResumeUsed);
  const freeCoverUsed = Boolean(user.freeCoverUsed);

  // Determine if allowed
  const isPaid = plan !== "free" && status === "active";
  const limit = planLimit(plan);

  if (!isPaid) {
    // Free taste: 1 resume + 1 cover letter total
    if (mode === "tailor" && freeResumeUsed) {
      return json(402, { error: "Free resume tailor already used. Please upgrade." });
    }
    if (mode === "cover_letter" && freeCoverUsed) {
      return json(402, { error: "Free cover letter already used. Please upgrade." });
    }
  } else {
    if (used >= limit) {
      return json(402, { error: "Monthly limit reached. Upgrade your plan to continue." });
    }
  }

  // Gemini endpoint (higher free-tier capacity than deprecated 1.5 flash)
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;

  const { systemRules, userPrompt } = buildPrompts(mode, body.resumeData, body.jobDescription);

  const geminiRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemRules + "\n\n" + userPrompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1400 },
    }),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return json(500, { error: "Gemini request failed.", details: errText });
  }

  const data = (await geminiRes.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") || "";
  const jsonText = extractJsonBlock(text) ?? text.trim();
  const parsed = safeJsonParse<any>(jsonText);

  // ✅ Update usage AFTER successful AI response
  if (!isPaid) {
    // mark free taste as used for the mode that ran
    await userRef.set(
      {
        plan: "free",
        subscriptionStatus: "active",
        freeResumeUsed: mode === "tailor" ? true : freeResumeUsed,
        freeCoverUsed: mode === "cover_letter" ? true : freeCoverUsed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } else {
    await userRef.set(
      {
        applicationsUsedThisMonth: used + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  if (mode === "cover_letter") {
    const typed = parsed as CoverLetterResponse;
    if (!typed?.coverLetter || !Array.isArray(typed?.talkingPoints)) {
      return json(500, { error: "Could not parse Gemini JSON response (cover_letter).", raw: text.slice(0, 4000) });
    }
    return json(200, typed);
  }

  const typed = parsed as TailorResponse;
  if (!typed?.tailoredData || !Array.isArray(typed?.suggestions)) {
    return json(500, { error: "Could not parse Gemini JSON response (tailor).", raw: text.slice(0, 4000) });
  }
  return json(200, typed);
};
