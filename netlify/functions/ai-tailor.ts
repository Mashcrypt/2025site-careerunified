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

function safeJsonParse<T = any>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractJsonBlock(text: string): string | null {
  // If Gemini wraps JSON in ```json ... ```
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  // If Gemini returns plain JSON but with extra text, try to extract first {...} block
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }
  return null;
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
          "Missing GEMINI_API_KEY. Add it in Netlify: Site settings → Environment variables.",
      }),
    };
  }

  const body = safeJsonParse<{ resumeData: ResumeData; jobDescription: string }>(
    event.body || ""
  );

  if (!body?.resumeData || !body?.jobDescription?.trim()) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "resumeData and jobDescription are required." }),
    };
  }

  // Gemini REST endpoint (no extra dependencies required)
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

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
${body.jobDescription}

CURRENT RESUME JSON:
${JSON.stringify(body.resumeData)}

TASK:
1) Generate 4-8 short suggestions describing what you changed.
2) Output tailoredData: the updated ResumeData JSON optimized for this job description.
`.trim();

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
          maxOutputTokens: 1200,
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
    const parsed = safeJsonParse<{ suggestions: string[]; tailoredData: ResumeData }>(
      jsonText
    );

    if (!parsed?.tailoredData || !Array.isArray(parsed?.suggestions)) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Could not parse Gemini JSON response.",
          raw: text.slice(0, 4000),
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
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
