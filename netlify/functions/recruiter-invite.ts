import type {Handler} from "@netlify/functions";
import crypto from "crypto";
import {getAdmin} from "./_firebaseAdmin";
import {checkRateLimit} from "./_rateLimit";
import {bearerToken, cleanText, json} from "./_applicationUtils";
import {sendTransactionalEmail} from "./_notify";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function emailAddress(value: unknown) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function inviteUrl(token: string) {
  const site = (process.env.URL || process.env.SITE_URL || "https://careerunified.com").replace(/\/$/, "");
  return `${site}/recruiter-invite.html?token=${encodeURIComponent(token)}`;
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  try {
    const token = bearerToken(event);
    if (!token) return json(401, origin, {error: "Please sign in again."});
    const admin = getAdmin();
    const decoded: any = await admin.auth().verifyIdToken(token);
    if (decoded.recruiter !== true || decoded.companyId && decoded.companyId !== decoded.uid) {
      return json(403, origin, {error: "Only the company recruiter can invite members."});
    }
    if (event.httpMethod !== "POST") return json(405, origin, {error: "Method Not Allowed"});
    const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "{}");
    const rawEmails: unknown[] = Array.isArray(body.emails) ? body.emails : String(body.email || "").split(",");
    const emails: string[] = [...new Set(rawEmails.map((value: unknown) => emailAddress(value)).filter((email: string): email is string => Boolean(email)))].slice(0, 20);
    const role = body.role === "Administrator" ? "Administrator" : body.role === "Member" ? "Member" : "";
    if (!emails.length || !role) return json(400, origin, {error: "Add valid email addresses and choose a role."});
    const rateLimit = await checkRateLimit({admin, action: "recruiter-invite", identifier: `uid:${decoded.uid}`, limit: 20, windowSeconds: 60 * 60});
    if (!rateLimit.allowed) return json(429, origin, {error: "Too many invitations were sent. Please try again later."});
    const db = admin.firestore();
    const recruiter = (await db.doc(`recruiters/${decoded.uid}`).get()).data() || {};
    const companyName = cleanText(recruiter.companyProfile?.name || recruiter.companyName || "your company", 160);
    const results = [];
    for (const email of emails) {
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const now = admin.firestore.Timestamp.now();
      await db.collection("recruiterInvites").doc(hashToken(rawToken)).set({
        companyId: decoded.uid, invitedBy: decoded.uid, email, role, status: "pending", createdAt: now,
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const link = inviteUrl(rawToken);
      const safeCompanyName = escapeHtml(companyName);
      const safeRole = escapeHtml(role);
      const safeLink = escapeHtml(link);
      await sendTransactionalEmail({
        to: email,
        subject: `${companyName} invited you to Career Unified`,
        text: `You have been invited to join ${companyName} on Career Unified as a ${role}. Accept the invitation within 7 days: ${link}`,
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join ${safeCompanyName} on Career Unified</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#16213d;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:32px 24px 20px;">
              <img src="https://careerunified.com/android-chrome-192x192.png" alt="Career Unified" width="96" height="96" style="display:block;width:96px;height:96px;object-fit:contain;">
            </td>
          </tr>
          <tr>
            <td style="padding:12px 40px 40px;">
              <h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;color:#16213d;">You are invited to join ${safeCompanyName}</h1>
              <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Hello,</p>
              <p style="font-size:16px;line-height:1.6;margin:0 0 24px;">${safeCompanyName} has invited you to join its Career Unified recruiting team as a <strong>${safeRole}</strong>.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:6px;background:#2563eb;">
                    <a href="${safeLink}" style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-size:16px;font-weight:bold;">Accept invitation</a>
                  </td>
                </tr>
              </table>
              <p style="font-size:14px;line-height:1.6;color:#5d6b85;margin:0;">This invitation expires in 7 days. If you were not expecting this invitation, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background:#f8fafc;text-align:center;">
              <p style="font-size:13px;line-height:1.5;color:#718096;margin:0 0 8px;">Career Unified helps people find jobs, bursaries, university opportunities, and career tools.</p>
              <p style="font-size:13px;margin:0;"><a href="https://careerunified.com" style="color:#2563eb;">Visit Career Unified</a>&nbsp;|&nbsp;<a href="https://careerunified.com/privacy" style="color:#2563eb;">Privacy Policy</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
        tag: "recruiter-invitation",
      });
      results.push({email, status: "sent"});
    }
    return json(200, origin, {invitations: results});
  } catch (error) {
    console.error("RECRUITER_INVITE_ERROR", error instanceof Error ? error.name : "UnknownError");
    return json(500, origin, {error: "The invitation could not be sent. Please try again."});
  }
};

export const acceptHandler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  try {
    if (event.httpMethod !== "POST") return json(405, origin, {error: "Method Not Allowed"});
    const token = bearerToken(event);
    if (!token) return json(401, origin, {error: "Please sign in before accepting the invitation."});
    const admin = getAdmin();
    const decoded: any = await admin.auth().verifyIdToken(token);
    const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "{}");
    const rawInvite = cleanText(body.token, 200);
    if (!/^[A-Za-z0-9_-]{40,}$/.test(rawInvite)) return json(400, origin, {error: "Invalid invitation."});
    const ref = admin.firestore().doc(`recruiterInvites/${hashToken(rawInvite)}`);
    const snapshot = await ref.get();
    const invite = snapshot.data() || {};
    if (!snapshot.exists || invite.status !== "pending" || invite.expiresAt?.toMillis?.() <= Date.now() || invite.email !== String(decoded.email || "").toLowerCase()) {
      return json(400, origin, {error: "This invitation is invalid, expired, or belongs to another email address."});
    }
    const invitedUser = await admin.auth().getUser(decoded.uid);
    await admin.auth().setCustomUserClaims(decoded.uid, {
      ...(invitedUser.customClaims || {}),
      recruiter: true,
      companyId: invite.companyId,
      recruiterRole: invite.role,
    });
    await admin.firestore().doc(`recruiterMembers/${invite.companyId}_${decoded.uid}`).set({companyId: invite.companyId, userId: decoded.uid, email: invite.email, role: invite.role, invitedBy: invite.invitedBy, status: "active", createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()});
    await ref.update({status: "accepted", acceptedBy: decoded.uid, acceptedAt: admin.firestore.FieldValue.serverTimestamp()});
    return json(200, origin, {companyId: invite.companyId, role: invite.role, refreshToken: true});
  } catch (error) {
    console.error("RECRUITER_INVITE_ACCEPT_ERROR", error instanceof Error ? error.name : "UnknownError");
    return json(500, origin, {error: "The invitation could not be accepted."});
  }
};
