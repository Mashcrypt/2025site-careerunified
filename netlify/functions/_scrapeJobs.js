// netlify/functions/_scrapeJobs.js

function toText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join(" ");
  }

  if (typeof value === "object") {
    if (typeof value.current === "string") return value.current;
    if (typeof value.title === "string") return value.title;
    if (typeof value.name === "string") return value.name;
    if (typeof value.value === "string") return value.value;
    if (typeof value.text === "string") return value.text;

    if (Array.isArray(value.children)) {
      return value.children.map(toText).filter(Boolean).join(" ");
    }
  }

  return "";
}

function clean(value = "") {
  return toText(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function querySanity({ type, limit, basePath }) {
  const projectId = process.env.VITE_SANITY_PROJECT_ID || "qjg5raj1";
  const dataset = process.env.VITE_SANITY_DATASET || "production";

  const query = `*[_type == "${type}"] | order(_createdAt desc)[0...${limit}]{
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
    throw new Error(`Sanity fetch failed for ${type}: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  const items = Array.isArray(data?.result) ? data.result : [];

  return items
    .filter((item) => item?.slug)
    .map((item) => ({
      title: clean(item.title) || "Untitled",
      company: clean(item.company) || "Not specified",
      location: clean(item.location) || "Not specified",
      salary: clean(item.salary) || "Not specified",
      closingDate: clean(item.closingDate) || "Not specified",
      url: `https://careerunified.com/${basePath}/${clean(item.slug)}`,
    }));
}

export async function fetchLatestJobsFromSite(limit = 3) {
  return querySanity({
    type: "job",
    limit,
    basePath: "jobs",
  });
}

export async function fetchLatestBursariesFromSite(limit = 3) {
  return querySanity({
    type: "bursary",
    limit,
    basePath: "bursary",
  });
}
