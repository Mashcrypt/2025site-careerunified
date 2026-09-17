import crypto from "crypto";
import type {Firestore, DocumentSnapshot} from "firebase-admin/firestore";
import {getStore} from "@netlify/blobs";

export const RESERVED_CAREER_SUBDOMAINS = new Set(["www", "api", "app", "admin", "mail", "support", "status", "help", "localhost"]);

export type CareerSiteConfig = {
  companyId: string;
  slug: string;
  displayName: string;
  logo: string;
  brandColors: {primary: string; secondary: string};
  tagline: string;
  about: string;
  contact: {email: string; website: string; phone: string};
  socialLinks: Record<string, string>;
  status: "published" | "unpublished";
  seo: {title: string; description: string};
  baseDomain?: string;
  layout?: "bold" | "clean" | "editorial" | "split";
  media?: Record<string, unknown>;
  contentSections?: Array<Record<string, unknown>>;
  customCode?: Record<string, string>;
  widget?: Record<string, string>;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function cleanSiteText(value: unknown, max = 500) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

export function slugifyCompanyName(value: unknown) {
  return cleanSiteText(value, 160).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "company";
}

function safeColor(value: unknown, fallback: string) {
  const color = cleanSiteText(value, 20);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function safeUrl(value: unknown) {
  const raw = cleanSiteText(value, 1200);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "";
  } catch { return ""; }
}

function socialLinks(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(["facebook", "instagram", "twitter", "linkedin"].map((key) => [key, safeUrl(input[key])]));
}

export function configFromRecruiter(companyId: string, recruiter: Record<string, any>, existing?: Partial<CareerSiteConfig>): CareerSiteConfig {
  const profile = recruiter.companyProfile || {};
  const displayName = cleanSiteText(existing?.displayName || profile.name || recruiter.companyName, 160) || "Your company";
  const config = {
    companyId, slug: cleanSiteText(existing?.slug, 60), displayName, baseDomain: process.env.CAREER_SITE_BASE_DOMAIN || "careerunified.com", layout: ["bold", "clean", "editorial", "split"].includes(existing?.layout as string) ? existing?.layout as CareerSiteConfig["layout"] : "bold",
    logo: safeUrl(existing?.logo || profile.logo),
    brandColors: {primary: safeColor(existing?.brandColors?.primary, "#0d47ff"), secondary: safeColor(existing?.brandColors?.secondary, "#14213d")},
    tagline: cleanSiteText(existing?.tagline || profile.tagline, 240), about: cleanSiteText(existing?.about || profile.about, 4000),
    contact: {email: cleanSiteText(existing?.contact?.email || profile.email || recruiter.email, 254).toLowerCase(), website: safeUrl(existing?.contact?.website || profile.website), phone: cleanSiteText(existing?.contact?.phone || profile.phone, 40)},
    socialLinks: socialLinks(existing?.socialLinks || profile.socialLinks),
    media: existing?.media && typeof existing.media === "object" ? existing.media : {},
    contentSections: Array.isArray(existing?.contentSections) ? existing.contentSections : [],
    customCode: existing?.customCode && typeof existing.customCode === "object" ? existing.customCode : {},
    widget: existing?.widget && typeof existing.widget === "object" ? existing.widget : {},
    status: existing?.status === "published" ? "published" : "unpublished",
    seo: {title: cleanSiteText(existing?.seo?.title, 160) || `${displayName} careers`, description: cleanSiteText(existing?.seo?.description, 320) || `Explore careers and open positions at ${displayName}.`},
  } as CareerSiteConfig;
  return config;
}

function suffixFor(companyId: string) { return crypto.createHash("sha256").update(companyId).digest("hex").slice(0, 8); }

export async function ensureCareerSite(db: Firestore, companyId: string) {
  const ref = db.doc(`recruiters/${companyId}`);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return null;
    const recruiter = snapshot.data() || {};
    const current = recruiter.careerSite as Partial<CareerSiteConfig> | undefined;
    if (current?.slug) return configFromRecruiter(companyId, recruiter, current);
    const base = slugifyCompanyName(recruiter.companyProfile?.name || recruiter.companyName || "company");
    const match = await db.collection("recruiters").where("careerSite.slug", "==", base).limit(1).get();
    const slug = match.empty ? base : `${base}-${suffixFor(companyId)}`;
    const config = configFromRecruiter(companyId, recruiter, {slug});
    const now = new Date().toISOString();
    tx.set(ref, {careerSite: {...config, createdAt: now, updatedAt: now}}, {merge: true});
    return {...config, createdAt: now, updatedAt: now};
  });
}

function requestHost(request: Request) {
  const configuredHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (configuredHost) return configuredHost.split(",")[0].trim().toLowerCase();
  try { return new URL(request.url).host.toLowerCase(); } catch { return ""; }
}

export function companySlugFromHost(request: Request) {
  const host = requestHost(request).split(":")[0];
  const base = (process.env.CAREER_SITE_BASE_DOMAIN || "careerunified.com").toLowerCase();
  if (host.endsWith(`.${base}`)) return host.slice(0, -(base.length + 1));
  const nipIoMatch = host.match(/^([a-z0-9-]+)\.(?:127\.0\.0\.1|localhost)\.nip\.io$/);
  if (nipIoMatch) return nipIoMatch[1];
  if (/^(?:[a-z0-9-]+\.)?localhost$/.test(host) || /^(?:[a-z0-9-]+\.)?127\.0\.0\.1$/.test(host)) return host.split(".")[0];
  return "";
}

export function validCompanySlug(slug: string) { return /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(slug) && !RESERVED_CAREER_SUBDOMAINS.has(slug); }

export async function resolveCompanyFromHost(db: Firestore, request: Request, localSlug = "") {
  const hostSlug = companySlugFromHost(request);
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() || "";
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost") || host.endsWith(".127.0.0.1") || host.endsWith(".nip.io");
  const slug = hostSlug || (isLocal ? localSlug : "");
  if (!validCompanySlug(slug)) return null;
  const snapshot = await db.collection("recruiters").where("careerSite.slug", "==", slug).limit(1).get();
  if (snapshot.empty) return null;
  const company = snapshot.docs[0];
  const config = company.data().careerSite as CareerSiteConfig;
  return config?.status === "published" ? {companyId: company.id, config} : null;
}

export function isPublishedJob(job: Record<string, any>, companyId: string) {
  if (job.recruiterId !== companyId || job.status !== "active" || job.deleted === true || job.archived === true || job.suspended === true || job.restricted === true) return false;
  if (!cleanSiteText(job.title, 180) || !cleanSiteText(job.description, 30000)) return false;
  if (!job.deadline) return true;
  const deadline = new Date(job.deadline);
  if (Number.isNaN(deadline.getTime())) return false;
  deadline.setHours(23, 59, 59, 999);
  return deadline.getTime() >= Date.now();
}

export async function getPublishedJobsForCompany(db: Firestore, companyId: string) {
  const snapshot = await db.collection("jobs").where("recruiterId", "==", companyId).where("status", "==", "active").get();
  return snapshot.docs.filter((doc: DocumentSnapshot) => isPublishedJob(doc.data() || {}, companyId)).map((doc) => ({id: doc.id, ...doc.data()}));
}

export async function getPublicCareerSite(db: Firestore, companySlug: string) {
  if (!validCompanySlug(companySlug)) return null;
  const snapshot = await db.collection("recruiters").where("careerSite.slug", "==", companySlug).limit(1).get();
  if (snapshot.empty) return null;
  const config = snapshot.docs[0].data().careerSite as CareerSiteConfig;
  return config?.status === "published" ? {companyId: snapshot.docs[0].id, config} : null;
}

const PUBLIC_CACHE_TTL_SECONDS = 60;
const publicCareerStore = () => getStore("career-unified-public-career-sites");

export async function getCachedPublicCareerSite(db: Firestore, companySlug: string) {
  const key = `site:${companySlug}`;
  const cached = await publicCareerStore().get(key, {type: "json"}) as {expiresAt: number; value: {companyId: string; config: CareerSiteConfig}} | null;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await getPublicCareerSite(db, companySlug);
  if (value) await publicCareerStore().setJSON(key, {expiresAt: Date.now() + PUBLIC_CACHE_TTL_SECONDS * 1000, value});
  return value;
}

export async function getCachedPublishedJobsForCompany(db: Firestore, companyId: string, companySlug: string) {
  const key = `jobs:${companySlug}`;
  const cached = await publicCareerStore().get(key, {type: "json"}) as {expiresAt: number; value: any[]} | null;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await getPublishedJobsForCompany(db, companyId);
  await publicCareerStore().setJSON(key, {expiresAt: Date.now() + PUBLIC_CACHE_TTL_SECONDS * 1000, value});
  return value;
}
