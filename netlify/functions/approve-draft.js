// netlify/functions/approve-draft.js
import { getAdmin } from "./_firebaseAdmin";
import { verifyApprovalToken } from "./_approvalToken";
import { checkRateLimit, clientIpFromHeaders } from "./_rateLimit";

const COLLECTION = "post_drafts";

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
    const token = event.queryStringParameters?.token;
    if (!id) {
      return { statusCode: 400, body: "Missing id" };
    }
    if (!token || !verifyApprovalToken(id, token)) {
      return { statusCode: 403, body: "Invalid or expired approval link" };
    }

    const admin = getAdmin();
    const db = admin.firestore();
    const rateLimit = await checkRateLimit({
      admin,
      action: "draft-approval",
      identifier: `ip:${clientIpFromHeaders(event.headers)}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        body: "Too many approval attempts. Please try again later.",
      };
    }

    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return { statusCode: 404, body: "Draft not found" };
    }

    const data = snap.data() || {};

    if (data.status === "PENDING") {
      await ref.update({
        status: "APPROVED",
        approvedAt: new Date(),
      });
    }

    const postText = data.postText || "";
    const safeText = escapeHtml(postText);

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Approve Draft</title>
  <style>
    body { font-family: system-ui, Arial, sans-serif; padding: 16px; max-width: 760px; margin: 0 auto; }
    pre { white-space: pre-wrap; background: #f6f7f9; padding: 14px; border-radius: 12px; line-height: 1.6; }
    button { padding: 10px 14px; border-radius: 10px; border: 0; cursor: pointer; font-size: 16px; }
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

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html,
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: `Error: ${e?.message || String(e)}`,
    };
  }
}
