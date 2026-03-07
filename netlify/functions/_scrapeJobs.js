// netlify/functions/_scrapeJobs.js

function toText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  // If Sanity returns rich text blocks/arrays/objects, flatten safely
  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join(" ");
  }

  if (typeof value === "object") {
    // Common Sanity patterns
    if (typeof value.current === "string") return value.current;
    if (typeof value.title === "string") return value.title;
    if (typeof value.name === "string") return value.name;
    if (typeof value.value === "string") return value.value;
    if (typeof value.text === "string") return value.text;

    // Portable text blocks
    if (Array.isArray(value.children)) {
      return value.children.map(toText).filter(Boolean).join(" ");
    }

    return "";
  }

  return "";
}

function stripTags(value = "") {
  return toText(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function fetchLatestJobFromSite() {
  const projectId = process.env.VITE_SANITY_PROJECT_ID || "qjg5raj1";
  const dataset = process.env.VITE_SANITY_DATASET || "production";

  // If "job" is not your real schema type, change it later
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
    throw new Error(`No latest job found in Sanity. Check the schema type name.`);
  }

  if (!job.slug) {
    throw new Error(`Latest job has no slug in Sanity.`);
  }

  return {
    title: stripTags(job.title) || "Untitled job",
    company: stripTags(job.company) || "Not specified",
    location: stripTags(job.location) || "Not specified",
    salary: stripTags(job.salary) || "",
    closingDate: stripTags(job.closingDate) || "",
    url: `https://careerunified.com/jobs/${stripTags(job.slug)}`,
  };
}
