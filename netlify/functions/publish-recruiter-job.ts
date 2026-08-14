import type { Handler } from "@netlify/functions";
import { getAdmin } from "./_firebaseAdmin";
import { checkRateLimit } from "./_rateLimit";

class PublishError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

function corsHeaders(origin?: string) {
  const allowed = process.env.ALLOWED_ORIGIN || process.env.SITE_URL || "";
  const cleanAllowed = allowed.replace(/\/+$/, "");
  const cleanOrigin = origin?.replace(/\/+$/, "");
  return {
    "Access-Control-Allow-Origin": cleanAllowed && cleanOrigin === cleanAllowed ? cleanOrigin : cleanAllowed || "null",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(statusCode: number, body: unknown, headers?: Record<string, string>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body),
  };
}

function decodeBody(body: string | null, isBase64Encoded?: boolean) {
  if (!body) return "";
  return isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().replace(/\u0000/g, "").slice(0, max) : "";
}

function optionalUrl(value: unknown) {
  const raw = text(value, 2000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

const COMPANY_SOCIAL_HOSTS = {
  facebook: new Set(["facebook.com", "www.facebook.com", "m.facebook.com"]),
  instagram: new Set(["instagram.com", "www.instagram.com"]),
  twitter: new Set(["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]),
  linkedin: new Set(["linkedin.com", "www.linkedin.com"]),
};

function companySocialUrl(value: unknown, allowedHosts: Set<string>) {
  const raw = text(value, 2000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && allowedHosts.has(url.hostname.toLowerCase()) ? url.toString() : "";
  } catch {
    return "";
  }
}

function companySocialLinks(value: unknown) {
  const links = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    facebook: companySocialUrl(links.facebook, COMPANY_SOCIAL_HOSTS.facebook),
    instagram: companySocialUrl(links.instagram, COMPANY_SOCIAL_HOSTS.instagram),
    twitter: companySocialUrl(links.twitter, COMPANY_SOCIAL_HOSTS.twitter),
    linkedin: companySocialUrl(links.linkedin, COMPANY_SOCIAL_HOSTS.linkedin),
  };
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stringList(value: unknown, itemMax: number, limit: number) {
  return Array.isArray(value) ? value.map((item) => text(item, itemMax)).filter(Boolean).slice(0, limit) : [];
}

const EMPLOYMENT_EQUITY_TEMPLATE = "employment_equity_self_identification";
const EMPLOYMENT_EQUITY_OPTIONS = ["Black African", "Coloured", "Indian or Asian", "White", "Other"];
const EMPLOYMENT_EQUITY_LABEL = "For employment equity reporting, how do you voluntarily self-identify?";

function screeningQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((question: any, index) => {
    const templateKey = text(question?.templateKey, 80);
    const isEmploymentEquity = templateKey === EMPLOYMENT_EQUITY_TEMPLATE;
    const type = ["yes_no", "number", "single_select", "multi_select", "short_text"].includes(question?.type)
      ? question.type
      : "short_text";
    const criteriaValue = text(question?.criteria?.value, 120);
    return {
      id: text(question?.id, 80) || `question_${index + 1}`,
      label: isEmploymentEquity ? EMPLOYMENT_EQUITY_LABEL : text(question?.label, 240),
      templateKey,
      type: isEmploymentEquity ? "single_select" : type,
      required: isEmploymentEquity ? false : question?.required !== false,
      options: isEmploymentEquity ? [...EMPLOYMENT_EQUITY_OPTIONS] : stringList(question?.options, 120, 12),
      criteria: !isEmploymentEquity && question?.criteria?.operator && criteriaValue
        ? { operator: question.criteria.operator === "gte" ? "gte" : "equals", value: criteriaValue }
        : null,
    };
  }).filter((question) => question.label);
}

function jobFaqs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((faq: any, index) => ({
    id: text(faq?.id, 80) || `faq_${index + 1}`,
    question: text(faq?.question, 240),
    answer: text(faq?.answer, 1200),
  })).filter((faq) => faq.question && faq.answer);
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
}

function cleanJob(value: any) {
  const requestedApplicationMethod = text(value?.applicationMethod, 20);
  const applicationMethod = ["direct", "external", "email"].includes(requestedApplicationMethod)
    ? requestedApplicationMethod
    : "direct";
  const title = text(value?.title, 180);
  const category = text(value?.category, 120);
  const type = text(value?.type, 120);
  const experience = text(value?.experience, 120);
  const company = text(value?.company, 180);
  const city = text(value?.city, 120);
  const country = text(value?.country, 120);
  const email = text(value?.email, 254).toLowerCase();
  const description = text(value?.description, 30000);

  if (!title || !category || !type || !experience || !company || !city || !country || !description || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PublishError(400, "Complete the required job and company details before publishing.");
  }

  const applyLink = applicationMethod === "external" ? optionalUrl(value?.applyLink) : "";
  if (applicationMethod === "external" && !applyLink) {
    throw new PublishError(400, "Enter a valid external application link before publishing.");
  }

  return {
    title,
    category,
    type,
    experience,
    minimumQualification: text(value?.minimumQualification, 250),
    securityClearance: text(value?.securityClearance, 50) || "No",
    driversLicence: text(value?.driversLicence, 50) || "No",
    visaSponsorship: text(value?.visaSponsorship, 50) || "No",
    salaryType: text(value?.salaryType, 50) || "Range",
    salaryMin: numberOrNull(value?.salaryMin),
    salaryMax: numberOrNull(value?.salaryMax),
    salaryFrequency: text(value?.salaryFrequency, 50) || "Per Month",
    salary: text(value?.salary, 120) || "Negotiable",
    overview: text(value?.overview, 20000),
    description,
    responsibilities: text(value?.responsibilities, 20000),
    requirements: text(value?.requirements, 20000),
    jobFaqs: jobFaqs(value?.jobFaqs),
    facilities: stringList(value?.facilities, 120, 30),
    city,
    country,
    workPreference: text(value?.workPreference, 50) || "On Site",
    remote: value?.remote === true,
    company,
    email,
    website: optionalUrl(value?.website),
    logo: optionalUrl(value?.logo),
    companySocialLinks: companySocialLinks(value?.companySocialLinks),
    companyProfileVersion: text(value?.companyProfileVersion, 120),
    deadline: text(value?.deadline, 80),
    applicationMethod,
    applyLink,
    screeningQuestions: applicationMethod === "direct" ? screeningQuestions(value?.screeningQuestions) : [],
    hiringProcess: stringList(value?.hiringProcess, 80, 10),
    status: "active",
    slug: slugify(text(value?.slug, 180) || `${title}-${company}-${city}`),
    companyIndustry: text(value?.companyIndustry, 160),
    companySize: text(value?.companySize, 80),
    companyAbout: text(value?.companyAbout, 3000),
    companyHQCity: text(value?.companyHQCity, 120),
    companyHQCountry: text(value?.companyHQCountry, 120),
    companyContactName: text(value?.companyContactName, 180),
  };
}

function dateValue(value: any) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasActiveRecruiterAccess(recruiter: any, now: Date) {
  const end = dateValue(recruiter?.subscriptionCurrentPeriodEnd);
  const hasPaidSubscription = recruiter?.plan && recruiter.plan !== "free"
    && recruiter?.subscriptionStatus === "active"
    && !!end
    && end.getTime() > now.getTime();

  const trialEnd = dateValue(recruiter?.trialEndsAt);
  const hasActiveTrial = recruiter?.plan === "pro"
    && recruiter?.subscriptionStatus === "trialing"
    && !!trialEnd
    && trialEnd.getTime() > now.getTime();

  return hasPaidSubscription || hasActiveTrial;
}

export const handler: Handler = async (event) => {
  const baseHeaders = corsHeaders(event.headers.origin || event.headers.Origin);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };

  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" }, baseHeaders);
    const rawBody = decodeBody(event.body, event.isBase64Encoded);
    if (Buffer.byteLength(rawBody, "utf8") > 250_000) return json(413, { error: "Job data is too large." }, baseHeaders);

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return json(401, { error: "Please sign in again." }, baseHeaders);

    const admin = getAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded.recruiter !== true) return json(403, { error: "Recruiter access only." }, baseHeaders);

    let body: any;
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      return json(400, { error: "Invalid job data." }, baseHeaders);
    }

    const job = cleanJob(body?.job);
    const jobId = text(body?.jobId, 120);
    if (jobId && !/^[A-Za-z0-9_-]+$/.test(jobId)) return json(400, { error: "Invalid job reference." }, baseHeaders);

    const rateLimit = await checkRateLimit({
      admin,
      action: "publish-recruiter-job",
      identifier: decoded.uid,
      limit: 20,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return json(429, { error: "Too many publishing attempts. Please try again shortly." }, {
        ...baseHeaders,
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    const db = admin.firestore();
    const recruiterRef = db.doc(`recruiters/${decoded.uid}`);
    const jobRef = jobId ? db.doc(`jobs/${jobId}`) : db.collection("jobs").doc();
    const now = new Date();

    const result = await db.runTransaction(async (tx) => {
      const recruiterSnap = await tx.get(recruiterRef);
      if (!recruiterSnap.exists) throw new PublishError(403, "Recruiter profile not found.");
      const recruiter = recruiterSnap.data() || {};

      const existingSnap = jobId ? await tx.get(jobRef) : null;
      const existing = existingSnap?.exists ? existingSnap.data() || {} : null;
      if (existing && existing.recruiterId !== decoded.uid) throw new PublishError(403, "You cannot edit this vacancy.");

      const alreadyPublished = existing?.status === "active";
      const hasPlanAccess = hasActiveRecruiterAccess(recruiter, now);
      const credits = Math.max(0, Number(recruiter.singleJobCredits || 0));
      const useSingleJobCredit = !hasPlanAccess && !alreadyPublished;

      if (useSingleJobCredit && credits < 1) {
        throw new PublishError(402, "Choose the R199 single-job offer or a monthly package before publishing.");
      }

      const data: Record<string, unknown> = {
        ...job,
        recruiterId: decoded.uid,
        applicationsCount: Number(existing?.applicationsCount || 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (!existing) data.createdAt = admin.firestore.FieldValue.serverTimestamp();

      if (useSingleJobCredit) {
        const sponsoredUntil = new Date(now);
        sponsoredUntil.setDate(sponsoredUntil.getDate() + 30);
        data.listingTier = "sponsored";
        data.badge = "Sponsored";
        data.sponsoredUntil = admin.firestore.Timestamp.fromDate(sponsoredUntil);
        data.singleJobOffer = true;
        tx.update(recruiterRef, {
          singleJobCredits: admin.firestore.FieldValue.increment(-1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else if (existing) {
        ["listingTier", "badge", "sponsoredUntil", "singleJobOffer"].forEach((field) => {
          if (existing[field] !== undefined) data[field] = existing[field];
        });
      }

      tx.set(jobRef, data, { merge: !!existing });
      return { jobId: jobRef.id, usedSingleJobCredit: useSingleJobCredit };
    });

    return json(200, result, baseHeaders);
  } catch (error) {
    if (error instanceof PublishError) return json(error.statusCode, { error: error.message }, baseHeaders);
    console.error("PUBLISH_RECRUITER_JOB_ERROR", error);
    return json(500, { error: "Could not publish this vacancy." }, baseHeaders);
  }
};
