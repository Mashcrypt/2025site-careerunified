export async function getJob(jobId: string) {
  const PROJECT_ID = "qjg5raj1";
  const DATASET = "production";

  // Use imageUrl helper format to ensure logo resolves correctly
  const query = `
*[_type == "job" && _id == "${jobId}"][0]{
  _id,
  title,
  description,
  location,
  salary,
  applyLink,
  posted,
  deadline,
  "companyName": company->name,
  "companyLogo": company->logo.asset->url,
  "companyLogoRef": company->logo.asset._ref
}
`;

  const url = `https://${PROJECT_ID}.api.sanity.io/v2023-08-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`;

  const res = await fetch(url);

  if (!res.ok) {
    console.error("Sanity fetch failed:", res.status, await res.text());
    return null;
  }

  const json = await res.json();
  const job = json.result;

  if (!job) return null;

  // If logo URL is missing but we have the ref, build the URL manually
  if (!job.companyLogo && job.companyLogoRef) {
    const ref = job.companyLogoRef; // e.g. image-abc123-800x600-jpg
    const parts = ref.replace("image-", "").split("-");
    const ext = parts.pop(); // jpg / png / webp
    const assetId = parts.join("-");
    job.companyLogo = `https://cdn.sanity.io/images/${PROJECT_ID}/${DATASET}/${assetId}.${ext}`;
  }

  return job;
}


