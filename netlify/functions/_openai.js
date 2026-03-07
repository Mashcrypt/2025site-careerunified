// netlify/functions/_openai.js

async function callGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`${model} -> ${raw}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${model} -> Non-JSON response: ${raw}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) {
    throw new Error(`${model} -> Gemini returned empty response: ${raw}`);
  }

  return text;
}

export async function generateWhatsAppPost(job) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const prompt = `
Turn this job into a WhatsApp Channel post.

Style:
- Attention grabbing headline
- Short intro
- Bullet highlights with emojis
- Clear call to action
- End with direct job link
- Clean, professional formatting
- No hashtags

Job data:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Salary: ${job.salary || "Not specified"}
Closing Date: ${job.closingDate || "Not specified"}
Link: ${job.url}
`.trim();

  const models = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite-preview-06-17",
  ];

  const errors = [];

  for (const model of models) {
    try {
      return await callGemini(apiKey, model, prompt);
    } catch (err) {
      errors.push(err?.message || String(err));
    }
  }

  throw new Error(`Gemini failed for all models: ${errors.join(" | ")}`);
}
