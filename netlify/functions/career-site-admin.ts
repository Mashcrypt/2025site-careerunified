import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {bearerToken, cleanText, json} from "./_applicationUtils";
import {configFromRecruiter, ensureCareerSite} from "./_careerSite";

export const handler: Handler = async (event) => {
  try {
    const token = bearerToken(event);
    if (!token) return json(401, event.headers.origin, {error: "Please sign in again."});
    const admin = getAdmin();
    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.recruiter !== true) return json(403, event.headers.origin, {error: "Recruiter access only."});
    const companyId = cleanText(event.queryStringParameters?.companyId, 160) || decoded.companyId || decoded.uid;
    if (companyId !== (decoded.companyId || decoded.uid)) return json(403, event.headers.origin, {error: "You cannot manage this company."});
    const db = admin.firestore();
    if (event.httpMethod === "GET") return json(200, event.headers.origin, {site: await ensureCareerSite(db, companyId)});
    if (event.httpMethod !== "PUT") return json(405, event.headers.origin, {error: "Method Not Allowed"});
    const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString() : event.body || "{}");
    const ref = db.doc(`recruiters/${companyId}`);
    const snapshot = await ref.get();
    if (!snapshot.exists) return json(404, event.headers.origin, {error: "Company not found."});
    const current = snapshot.data()?.careerSite || {};
    const layout = ["bold", "clean", "editorial", "split"].includes(body.layout) ? body.layout : "bold";
    const next = configFromRecruiter(companyId, snapshot.data() || {}, {...current, displayName: body.displayName, logo: body.logo, tagline: body.tagline, about: body.about, brandColors: body.brandColors, contact: body.contact, socialLinks: body.socialLinks, media: body.media, contentSections: body.contentSections, customCode: body.customCode, widget: body.widget, layout, status: body.status === "published" ? "published" : "unpublished", seo: body.seo});
    await ref.set({careerSite: {...next, createdAt: current.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()}}, {merge: true});
    return json(200, event.headers.origin, {site: next});
  } catch (error) {
    console.error("CAREER_SITE_ADMIN_ERROR", error instanceof Error ? error.name : "UnknownError");
    return json(500, event.headers.origin, {error: "Could not update the career site."});
  }
};
