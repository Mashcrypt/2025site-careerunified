// netlify/functions/_scrapeJobs.js

function stripTags(s = "") {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function fetchLatestJobFromSite() {
  const projectId = process.env.VITE_SANITY_PROJECT_ID || "qjg5raj1";
  const dataset = process.env.VITE_SANITY_DATASET || "production";

  // Adjust "job" if your schema type uses another name
  const query = `*[_type == "job"] | order(_createdAt desc)[0]{
    title,
    company,
    location,
    salary,
    closingDate,
    "slug": slug.current
  }`;

  const url =
    `https://${projectId}.api.sanity.io/v2023-10-01/data/query/${dataset}` +
    `?query=${encodeURIComponent(query)}`;

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Sanity fetch failed: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  const job = data?.result;

  if (!job) {
    throw new Error('No latest job found in Sanity. Check the schema type name in _scrapeJobs.js.');
  }

  if (!job.slug) {
    throw new Error("Latest job has no slug in Sanity.");
  }

  return {
    title: stripTags(job.title || "Untitled job"),
    company: stripTags(job.company || "Not specified"),
    location: stripTags(job.location || "Not specified"),
    salary: stripTags(job.salary || ""),
    closingDate: stripTags(job.closingDate || ""),
    url: `https://careerunified.com/jobs/${job.slug}`,
  };
}
