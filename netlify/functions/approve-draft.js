// netlify/functions/approve-draft.js
import { getDb } from "./_firebaseAdmin";

function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export async function handler(event) {
  try {
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode: 400, body: "Missing id" };

    const db = getDb();
    const ref = db.collection("job_posts").doc(id);
    const snap = await ref.get();

    if (!snap.exists) return { statusCode: 404, body: "Draft not found" };

    const data = snap.data() || {};

    if (data.status === "PENDING") {
      await ref.update({ status: "APPROVED", approvedAt: new Date() });
    }

    const postText = data.postText || "";
    const safeText = escapeHtml(postText);

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Approve WhatsApp Post</title>
  <style>
    body { font-family: system-ui, Arial; padding: 16px; max-width: 760px; margin: 0 auto; }
    pre { white-space: pre-wrap; background: #f6f7f9; padding: 12px; border-radius: 10px; }
    button { padding: 10px 14px; border-radius: 10px; border: 0; cursor: pointer; }
  </style>
</head>
<body>
  <h2>Approved ✅</h2>
  <p>Copy and paste this into your WhatsApp Channel:</p>
  <button id="copyBtn">Copy</button>
  <pre id="txt">${safeText}</pre>
  <script>
    const text = ${JSON.stringify(postText)};
    document.getElementById("copyBtn").addEventListener("click", async () => {
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    });
  </script>
</body>
</html>`;

    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
  } catch (e) {
    return { statusCode: 500, body: `Error: ${e?.message || String(e)}` };
  }
}
