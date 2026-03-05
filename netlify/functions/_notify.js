// netlify/functions/_notify.js
export async function sendApprovalEmail({ to, subject, text }) {
  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!key) throw new Error("Missing MAILGUN_API_KEY");
  if (!domain) throw new Error("Missing MAILGUN_DOMAIN");

  const form = new URLSearchParams();
  form.append("from", `Career Unified <postbot@${domain}>`);
  form.append("to", to);
  form.append("subject", subject);
  form.append("text", text);

  const resp = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`api:${key}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Mailgun error: ${resp.status} ${err}`);
  }
}
