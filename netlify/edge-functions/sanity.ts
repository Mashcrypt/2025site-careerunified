export async function getSanityJob(id) {
  const query = encodeURIComponent(`*[_type=="job" && _id=="${id}"][0]{
    _id,
    title,
    company,
    location,
    deadline
  }`);

  const url = `https://${process.env.SANITY_PROJECT_ID}.api.sanity.io/v2023-08-01/data/query/${process.env.SANITY_DATASET}?query=${query}`;

  const res = await fetch(url);
  const json = await res.json();
  return json.result;
}
