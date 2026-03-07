// netlify/functions/_openai.js

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
- Clean formatting

Job data:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Salary: ${job.salary || "Not specified"}
Closing Date: ${job.closingDate || "Not specified"}
Link: ${job.url}
`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
    {
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
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini error: ${err}`);
  }

  const data = await resp.json();

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return text;
}
