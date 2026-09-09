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
      await sendTransactionalEmail({
        to: email,
        subject: `${companyName} invited you to Career Unified`,
        text: `You have been invited to join ${companyName} on Career Unified as a ${role}. Accept the invitation within 7 days: ${link}`,
        html: `<p>You have been invited to join <strong>${companyName.replace(/[<&>]/g, "")}</strong> on Career Unified as a ${role}.</p><p><a href="${link}">Accept invitation</a></p><p>This invitation expires in 7 days.</p>`,
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
