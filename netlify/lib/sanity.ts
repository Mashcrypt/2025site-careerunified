const PROJECT_ID = "qjg5raj1";
const DATASET = "production";
const API_VERSION = "2024-01-01";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function querySanity(query: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({query});
  Object.entries(params).forEach(([key, value]) => search.set(`$${key}`, JSON.stringify(value)));

  const url = `https://${PROJECT_ID}.apicdn.sanity.io/v${API_VERSION}/data/query/${DATASET}?${search}`;
  const response = await fetch(url, {headers: {Accept: "application/json"}});

  if (!response.ok) {
    throw new Error(`Sanity fetch failed: ${response.status}`);
  }

  const json = await response.json();
  return json.result;
}

export {slugify};

export async function getJob(jobId: string) {
  return querySanity(
    `*[_type == "job" && _id == $id][0]{
      _id, title, description, location, salary, posted, deadline, jobType,
      applyLink, "slug": slug.current, "companyName": company->name,
      "companyLogo": company->logo.asset->url
    }`,
    {id: jobId},
  );
}

export async function getJobBySlug(slug: string) {
  return querySanity(
    `*[_type == "job" && (slug.current == $slug || _id == $slug)][0]{
      _id, _updatedAt, title, "slug": coalesce(slug.current, _id), description, location,
      salary, posted, deadline, jobType, applyLink,
      "companyName": company->name, "companyLogo": company->logo.asset->url
    }`,
    {slug},
  );
}

export async function getActiveJobs(limit = 200) {
  return querySanity(
    `*[_type == "job" && (!defined(deadline) || deadline >= $today)]
      | order(posted desc)[0...${limit}]{
        _id, title, "slug": coalesce(slug.current, _id), location, salary,
        posted, deadline, jobType, category, "companyName": company->name,
        "companyLogo": company->logo.asset->url
      }`,
    {today: today()},
  );
}

export async function getBursaryBySlug(slug: string) {
  return querySanity(
    `*[_type == "bursary" && (slug.current == $slug || _id == $slug)][0]{
      _id, _updatedAt, name, "slug": coalesce(slug.current, _id), provider, faculty,
      faculties, deadline, description, "providerLogoUrl": providerLogo.asset->url,
      applicationLink
    }`,
    {slug},
  );
}

export async function getActiveBursaries(limit = 200) {
  return querySanity(
    `*[_type == "bursary" && (!defined(deadline) || deadline >= $today)]
      | order(deadline asc)[0...${limit}]{
        _id, name, "slug": coalesce(slug.current, _id), provider, faculty, faculties,
        deadline
      }`,
    {today: today()},
  );
}

export async function getUniversities(limit = 200) {
  const universities = await querySanity(
    `*[_type == "university"] | order(deadline asc, name asc)[0...${limit}]{
      _id, name, "slug": slug.current, applicationLink, applicationFee,
      registrationFee, deadline, notes, city, province
    }`,
  );

  return (universities || []).map((university: Record<string, unknown>) => ({
    ...university,
    slug: university.slug || slugify(university.name),
  }));
}

export async function getUniversityBySlug(slug: string) {
  const universities = await getUniversities();
  return universities.find((university: Record<string, unknown>) => university.slug === slug) || null;
}
