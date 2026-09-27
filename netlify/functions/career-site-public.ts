import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {checkRateLimit} from "./_rateLimit";
import {json, cleanText} from "./_applicationUtils";
import {getCachedPublishedJobsForCompany, getCachedPublicCareerSite, getPublishedJobsForCompany, resolveCompanyFromHost} from "./_careerSite";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, event.headers.origin, {error: "Method Not Allowed"});
  try {
    const admin = getAdmin();
    const limit = await checkRateLimit({admin, action: "career-site-public", identifier: event.headers["x-forwarded-for"] || "unknown", limit: 120, windowSeconds: 60});
    if (!limit.allowed) return json(429, event.headers.origin, {error: "Please try again shortly."}, {"Retry-After": String(limit.retryAfterSeconds)});
    const db = admin.firestore();
    const request = new Request(`https://${event.headers.host || "localhost"}`, {headers: event.headers as Record<string, string>});
    const localSlug = cleanText(event.queryStringParameters?.company, 60);
    const tenant = await resolveCompanyFromHost(db, request, localSlug);
    if (!tenant) return json(404, event.headers.origin, {error: "Career site not found."});
    // The public page must remain available even when Netlify Blobs is
    // temporarily unavailable or has not been provisioned for a deploy.
    // Firestore is the source of truth; the cache is only an optimization.
    let cachedTenant = tenant;
    try {
      cachedTenant = await getCachedPublicCareerSite(db, tenant.config.slug) || tenant;
    } catch (error) {
      console.error("CAREER_SITE_PUBLIC_CACHE_ERROR", error instanceof Error ? error.message : error);
    }
    let jobs;
    try {
      jobs = await getCachedPublishedJobsForCompany(db, cachedTenant.companyId, cachedTenant.config.slug);
    } catch (error) {
      console.error("CAREER_SITE_PUBLIC_JOBS_CACHE_ERROR", error instanceof Error ? error.message : error);
      jobs = await getPublishedJobsForCompany(db, cachedTenant.companyId);
    }
    const requestedSlug = cleanText(event.queryStringParameters?.job, 220);
    const publicJobs = requestedSlug ? jobs.filter((job: any) => job.slug === requestedSlug) : jobs;
    return json(200, event.headers.origin, {site: cachedTenant.config, jobs: publicJobs.map((job: any) => ({id: job.id, slug: cleanText(job.slug, 220), title: cleanText(job.title, 180), location: cleanText(job.location || [job.city, job.country].filter(Boolean).join(", "), 160), type: cleanText(job.type, 100), category: cleanText(job.category, 120), deadline: cleanText(job.deadline, 80), overview: cleanText(job.overview, 20000), description: cleanText(job.description, 30000), responsibilities: cleanText(job.responsibilities, 20000), requirements: cleanText(job.requirements, 20000), applicationMethod: cleanText(job.applicationMethod, 20)}))}, {"Cache-Control": "public, max-age=60, stale-while-revalidate=300"});
  } catch (error) {
    console.error("CAREER_SITE_PUBLIC_ERROR", error instanceof Error ? error.name : "UnknownError");
    return json(500, event.headers.origin, {error: "Career site is temporarily unavailable."});
  }
};
