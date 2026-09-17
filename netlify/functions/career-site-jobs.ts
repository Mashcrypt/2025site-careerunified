import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {json, cleanText} from "./_applicationUtils";
import {getCachedPublishedJobsForCompany, getCachedPublicCareerSite} from "./_careerSite";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, event.headers.origin, {error: "Method Not Allowed"});
  const slug = cleanText(event.queryStringParameters?.slug, 60).toLowerCase();
  try {
    const db = getAdmin().firestore();
    const site = await getCachedPublicCareerSite(db, slug);
    if (!site) return json(404, event.headers.origin, {error: "Career site not found."});
    const jobs = await getCachedPublishedJobsForCompany(db, site.companyId, slug);
    return json(200, event.headers.origin, {
      company: {slug: site.config.slug, displayName: site.config.displayName, logo: site.config.logo},
      jobs: jobs.map((job: any) => ({id: job.id, slug: cleanText(job.slug, 220), title: cleanText(job.title, 180), location: cleanText(job.location || [job.city, job.country].filter(Boolean).join(", "), 160), type: cleanText(job.type, 100), category: cleanText(job.category, 120), deadline: cleanText(job.deadline, 80)})),
    }, {"Cache-Control": "public, max-age=60, stale-while-revalidate=300"});
  } catch (error) {
    console.error("CAREER_SITE_JOBS_ERROR", error instanceof Error ? error.name : "UnknownError");
    return json(500, event.headers.origin, {error: "Jobs are temporarily unavailable."});
  }
};
