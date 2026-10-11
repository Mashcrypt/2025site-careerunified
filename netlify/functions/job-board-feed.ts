import type {Handler, HandlerResponse} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {isPublishedJob} from "./_careerSite";

type FeedJob = Record<string, any> & {id: string};
type FeedCompany = {
  id: string;
  name: string;
  linkedinCompanyId: string;
  contactEmail: string;
};

const BASE_URL = "https://careerunified.com";

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value: unknown) {
  return `<![CDATA[${String(value ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function plainText(value: unknown) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/[\t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function dateValue(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate();
  }
  const date = value ? new Date(value as any) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function jobSlug(job: FeedJob) {
  const supplied = String(job.slug || "").trim();
  if (supplied) return supplied;
  const title = String(job.title || "job").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${title || "job"}--${job.id.slice(0, 8)}`;
}

function jobUrl(job: FeedJob) {
  return `${BASE_URL}/jobs/${encodeURIComponent(jobSlug(job))}`;
}

function employmentType(value: unknown) {
  const type = String(value || "").toLowerCase();
  if (type.includes("intern") || type.includes("graduate")) return "INTERNSHIP";
  if (type.includes("part")) return "PART_TIME";
  if (type.includes("contract")) return "CONTRACT";
  if (type.includes("volunteer")) return "VOLUNTEER";
  return "FULL_TIME";
}

function indeedXml(jobs: FeedJob[], companies: Map<string, FeedCompany>) {
  const eligible = jobs.filter(job => companies.get(String(job.recruiterId))?.contactEmail);
  const entries = eligible.map(job => {
    const company = companies.get(String(job.recruiterId))!;
    const url = jobUrl(job);
    const posted = dateValue(job.postedAt || job.createdAt).toISOString();
    const location = String(job.location || [job.city, job.country].filter(Boolean).join(", ") || "South Africa");
    const description = plainText(job.description || job.overview || "");
    return `  <job>
    <title>${cdata(job.title)}</title>
    <date>${cdata(posted)}</date>
    <referencenumber>${cdata(job.id)}</referencenumber>
    <requisitionid>${cdata(url)}</requisitionid>
    <url>${cdata(url)}</url>
    <company>${cdata(company.name)}</company>
    <city>${cdata(location)}</city>
    <country>${cdata("ZA")}</country>
    <jobtype>${cdata(employmentType(job.type || job.jobType))}</jobtype>
    <description>${cdata(description)}</description>
    <email>${cdata(company.contactEmail)}</email>
  </job>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<source>
  <publisher>Career Unified</publisher>
  <publisherurl>${xml(BASE_URL)}</publisherurl>
${entries}
</source>`;
}

function linkedinXml(jobs: FeedJob[], companies: Map<string, FeedCompany>) {
  const eligible = jobs.filter(job => {
    const company = companies.get(String(job.recruiterId));
    return company?.contactEmail && company.linkedinCompanyId && plainText(job.description || job.overview).length >= 100;
  });
  const entries = eligible.map(job => {
    const company = companies.get(String(job.recruiterId))!;
    const description = plainText(job.description || job.overview);
    const location = String(job.location || [job.city, job.country].filter(Boolean).join(", ") || "South Africa");
    const posted = dateValue(job.postedAt || job.createdAt);
    const deadline = job.deadline ? dateValue(job.deadline) : null;
    const dateString = (date: Date) => `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
    return `  <job>
    <partnerJobId>${cdata(job.id.slice(0, 40))}</partnerJobId>
    <company>${cdata(company.name)}</company>
    <title>${cdata(job.title)}</title>
    <description>${cdata(description)}</description>
    <applyUrl>${cdata(jobUrl(job))}</applyUrl>
    <companyId>${cdata(company.linkedinCompanyId)}</companyId>
    <location>${cdata(location)}</location>
    <country>${cdata("ZA")}</country>
    <jobtype>${cdata(employmentType(job.type || job.jobType))}</jobtype>
    <listDate>${cdata(dateString(posted))}</listDate>
${deadline ? `    <expirationDate>${cdata(dateString(deadline))}</expirationDate>\n` : ""}    <posterEmail>${cdata(company.contactEmail)}</posterEmail>
  </job>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<source>
  <lastBuildDate>${xml(new Date().toUTCString())}</lastBuildDate>
  <publisherUrl>${xml(BASE_URL)}</publisherUrl>
  <publisher>Career Unified</publisher>
  <expectedJobCount>${eligible.length}</expectedJobCount>
${entries}
</source>`;
}

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  if (event.httpMethod !== "GET") {
    return {statusCode: 405, headers: {Allow: "GET", "Content-Type": "text/plain; charset=utf-8"}, body: "Method Not Allowed"};
  }

  const board = String(event.queryStringParameters?.board || "").toLowerCase();
  if (board !== "indeed" && board !== "linkedin") {
    return {statusCode: 404, headers: {"Content-Type": "text/plain; charset=utf-8"}, body: "Unknown job board feed."};
  }

  try {
    const db = getAdmin().firestore();
    const [jobSnapshot, recruiterSnapshot] = await Promise.all([
      db.collection("jobs").where("status", "==", "active").get(),
      db.collection("recruiters").get(),
    ]);
    const companies = new Map<string, FeedCompany>();
    recruiterSnapshot.docs.forEach(document => {
      const recruiter = document.data();
      const careerSite = recruiter.careerSite || {};
      if (careerSite.status !== "published") return;
      const companyName = String(careerSite.displayName || recruiter.companyProfile?.name || recruiter.companyName || "").trim();
      const contactEmail = String(careerSite.jobBoardContactEmail || "").trim().toLowerCase();
      if (!companyName || !contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return;
      companies.set(document.id, {
        id: document.id,
        name: companyName,
        contactEmail,
        linkedinCompanyId: String(careerSite.linkedinCompanyId || "").replace(/\D/g, ""),
      });
    });
    const jobs = jobSnapshot.docs
      .map(document => ({id: document.id, ...document.data()} as FeedJob))
      .filter(job => companies.has(String(job.recruiterId)) && isPublishedJob(job, String(job.recruiterId)))
      .sort((a, b) => dateValue(b.postedAt || b.createdAt).getTime() - dateValue(a.postedAt || a.createdAt).getTime());
    const body = board === "indeed" ? indeedXml(jobs, companies) : linkedinXml(jobs, companies);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "X-Robots-Tag": "noindex, nofollow",
      },
      body,
    };
  } catch (error) {
    console.error("JOB_BOARD_FEED_ERROR", error instanceof Error ? error.name : "UnknownError");
    return {statusCode: 500, headers: {"Content-Type": "text/plain; charset=utf-8"}, body: "Job feed is temporarily unavailable."};
  }
};
