export async function generateWhatsAppPost(job) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const prompt = `
Turn this job into a WhatsApp Channel post.

Style:
- Attention grabbing headline
- Short intro
- Bullet highlights with emojis
- Clear call to action
- End with direct job link

Job data:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Salary: ${job.salary || "Not specified"}
Closing Date: ${job.closingDate || "Not specified"}
Link: ${job.url}
`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You write concise WhatsApp job posts." },
        { role: "user", content: prompt }
      ],
      temperature: 0.6
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await response.json();

  return data.choices?.[0]?.message?.content?.trim();
}
