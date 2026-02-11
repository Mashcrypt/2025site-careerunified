const PROJECT_ID = "qjg5raj1";
const DATASET = "production";
const API_VERSION = "2023-08-01";

/**
 * Fetch a single job with company + logo
 */
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
      applyLink,
      "company": company->name,
      "companyLogo": company->logo.asset->url
    }
  `;

  const url = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    console.error("Sanity error:", await res.text());
    return null;
  }

  const json = await res.json();
  return json.result;
}



