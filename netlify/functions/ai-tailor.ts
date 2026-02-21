// netlify/functions/ai-tailor.ts
import type { Handler } from "@netlify/functions";

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

type TailorResponse = {
  suggestions: string[];
  tailoredData: ResumeData;
};

type CoverLetterResponse = {
  coverLetter: string; // plain text
  talkingPoints: string[]; // 3-6 bullets
};

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

function normalizeMode(mode?: string): TailorMode {
  if (mode === "cover_letter") return "cover_letter";
  return "tailor";
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
Write a tailored cover letter for this job using only the resume facts. Include:
- A strong opening
- Why the candidate fits (skills/experience alignment)
- A closing call-to-action
Also return 3–6 talkingPoints the candidate can mention in an interview.
    `.trim();

    return { systemRules, userPrompt };
  }

  // default: tailor resume
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
- Improve clarity, action verbs, and quantification ONLY if it can be inferred from existing text (otherwise do not fabricate numbers).
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
2) Output tailoredData: the updated ResumeData JSON optimized for this job description.
  `.trim();

  return { systemRules, userPrompt };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          "Missing GEMINI_API_KEY. Add it in Netlify: Project configuration → Environment variables.",
      }),
    };
  }

  const body = safeJsonParse<TailorRequestBody>(event.body || "");
  const mode = normalizeMode(body?.mode);

  if (!body?.resumeData || !body?.jobDescription?.trim()) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "resumeData and jobDescription are required." }),
    };
  }

  // Better free-tier capacity than gemini-1.5-flash
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;

  const { systemRules, userPrompt } = buildPrompts(mode, body.resumeData, body.jobDescription);

  try {
    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: systemRules + "\n\n" + userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1400,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Gemini request failed.",
          details: errText,
        }),
      };
    }

    const data = (await geminiRes.json()) as any;
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") || "";

    const jsonText = extractJsonBlock(text) ?? text.trim();
    const parsed = safeJsonParse<any>(jsonText);

    if (mode === "cover_letter") {
      const typed = parsed as CoverLetterResponse;
      if (!typed?.coverLetter || !Array.isArray(typed?.talkingPoints)) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: "Could not parse Gemini JSON response (cover_letter).",
            raw: text.slice(0, 4000),
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(typed),
      };
    }

    // mode === "tailor"
    const typed = parsed as TailorResponse;
    if (!typed?.tailoredData || !Array.isArray(typed?.suggestions)) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Could not parse Gemini JSON response (tailor).",
          raw: text.slice(0, 4000),
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(typed),
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Server error calling Gemini.",
        details: e?.message || String(e),
      }),
    };
  }
};
