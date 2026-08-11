// netlify/functions/_notify.js
function headerValue(value, maxLength = 254) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function sendTransactionalEmail({ to, subject, text, replyTo, tag }) {
  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!key) throw new Error("Missing MAILGUN_API_KEY");
  if (!domain) throw new Error("Missing MAILGUN_DOMAIN");

  const form = new URLSearchParams();
  form.append("from", headerValue(process.env.MAIL_FROM || `Career Unified <postbot@${domain}>`));
  form.append("to", headerValue(to));
  form.append("subject", headerValue(subject, 180));
  form.append("text", String(text || "").slice(0, 12000));
  if (replyTo) form.append("h:Reply-To", headerValue(replyTo));
  if (tag) form.append("o:tag", headerValue(tag, 128));

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

  const response = await resp.json().catch(() => ({}));
  return {
    id: headerValue(response?.id, 240),
    message: headerValue(response?.message, 500),
  };
}

export async function sendApprovalEmail({ to, subject, text }) {
  return sendTransactionalEmail({ to, subject, text });
}
