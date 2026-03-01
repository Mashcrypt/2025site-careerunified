const PROJECT_ID = "qjg5raj1";
const DATASET = "production";

// Existing (keep)
export async function getJob(jobId: string) {
  const query = `
*[_type == "job" && _id == "${jobId}"][0]{
  _id,
  title,
  description,
  location,
  salary,
  posted,
  deadline,
  "companyName": company->name,
  "companyLogo": company->logo.asset->url
}
`;

  const url = `https://${PROJECT_ID}.api.sanity.io/v2023-08-01/data/query/${DATASET}?query=${encodeURIComponent(
    query
  )}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Sanity fetch failed");
  }

  const json = await res.json();
  return json.result;
}

// NEW: Get job by slug (for /jobs/<slug> Open Graph)
export async function getJobBySlug(slug: string) {
  const query = `
*[_type == "job" && slug.current == "${slug}"][0]{
  _id,
  title,
  "slug": slug.current,
  description,
  location,
  salary,
  posted,
  deadline,
  "companyName": company->name,
  "companyLogo": company->logo.asset->url
}
`;

  const url = `https://${PROJECT_ID}.api.sanity.io/v2023-08-01/data/query/${DATASET}?query=${encodeURIComponent(
    query
  )}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Sanity fetch failed");
  }

  const json = await res.json();
  return json.result;
}

/**
 * NEW: Get bursary by slug (for /bursary/<slug> Open Graph)
 * Matches your schema:
 * - name
 * - provider
 * - faculty
 * - deadline
 * - description
 * - providerLogo (image) => providerLogo.asset->url
 */
export async function getBursaryBySlug(slug: string) {
  const query = `
*[_type == "bursary" && slug.current == "${slug}"][0]{
  _id,
  name,
  "slug": slug.current,
  provider,
  faculty,
  deadline,
  description,
  "providerLogoUrl": providerLogo.asset->url,
  applicationLink
}
`;

  const url = `https://${PROJECT_ID}.api.sanity.io/v2023-08-01/data/query/${DATASET}?query=${encodeURIComponent(
    query
  )}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Sanity fetch failed");
  }

  const json = await res.json();
  return json.result;
}


