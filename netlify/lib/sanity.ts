const PROJECT_ID = "qjg5raj1";   // your project id
const DATASET = "production";

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

  const url = `https://${PROJECT_ID}.api.sanity.io/v2023-08-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Sanity fetch failed");
  }

  const json = await res.json();
  return json.result;
}

