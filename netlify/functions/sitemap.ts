import type {Handler} from "@netlify/functions";

const SITE_URL = "https://careerunified.com";
const PROJECT_ID = process.env.VITE_SANITY_PROJECT_ID || "qjg5raj1";
const DATASET = process.env.VITE_SANITY_DATASET || "production";
const API_VERSION = "2023-10-01";
const STATIC_LASTMOD = "2026-07-09";

type SitemapEntry = {
  loc: string;
  lastmod: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: string;
};

type SanityItem = {
  slug?: string;
  title?: string;
  name?: string;
  _updatedAt?: string;
  _createdAt?: string;
  posted?: string;
  deadline?: string;
};

function slugify(value?: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[-_]+/g, " ")
    .replace(/\bapply\s+now\b/g, "")
    .replace(/\bclosing\s+soon\b/g, "")
    .replace(/\bor\s+apply\b/g, "")
    .replace(/\bapply\b$/g, "")
    .replace(/\bor\b/g, "")
    .replace(/speciliast/g, "specialist")
    .replace(/machanical/g, "mechanical")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const today = () => new Date().toISOString().slice(0, 10);

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dateOnly(value?: string) {
  if (!value) return today();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function sanityUrl(query: string) {
  return `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`;
}

function staticEntries(): SitemapEntry[] {
  return [
    {loc: `${SITE_URL}/`, lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "1.0"},
    {loc: `${SITE_URL}/jobs`, lastmod: STATIC_LASTMOD, changefreq: "daily", priority: "0.9"},
    {loc: `${SITE_URL}/bursaries`, lastmod: STATIC_LASTMOD, changefreq: "daily", priority: "0.9"},
    {loc: `${SITE_URL}/varsity`, lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "0.85"},
    {loc: `${SITE_URL}/cv-tips`, lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "0.85"},
    {loc: `${SITE_URL}/cv-generator/`, lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.8"},
    {loc: `${SITE_URL}/z83-filler`, lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.8"},
    {loc: `${SITE_URL}/about-us`, lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.6"},
    {loc: `${SITE_URL}/contact-us`, lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.5"},
    {loc: `${SITE_URL}/privacy`, lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.3"},
    {loc: `${SITE_URL}/terms`, lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.3"},
  ];
}

async function fetchSanityItems(type: "job" | "bursary" | "university", limit = 2000): Promise<SanityItem[]> {
  const slugPath = type === "university"
    ? `"slug": slug.current`
    : `"slug": coalesce(slug.current, _id)`;
  const deadlineFilter = type === "university" ? "" : ` && (!defined(deadline) || deadline >= "${today()}")`;
  const query = `*[_type == "${type}"${deadlineFilter}] | order(coalesce(_updatedAt, _createdAt) desc)[0...${limit}]{
    ${slugPath},
    title,
    name,
    _updatedAt,
    _createdAt,
    posted,
    deadline
  }`;

  const response = await fetch(sanityUrl(query), {
    headers: {Accept: "application/json"},
  });

  if (!response.ok) {
    throw new Error(`Sanity sitemap fetch failed for ${type}: ${response.status}`);
  }

  const data = await response.json();
  const items = Array.isArray(data?.result) ? data.result : [];
  return type === "university"
    ? items.map((item: SanityItem) => ({...item, slug: item.slug || slugify(item.name)}))
    : items;
}

function opportunityEntries(items: SanityItem[], basePath: "jobs" | "bursary" | "varsity", priority: string): SitemapEntry[] {
  return items
    .map((item) => ({
      ...item,
      slug: slugify(item.slug || item.title || item.name),
    }))
    .filter((item) => item.slug)
    .map((item) => ({
      loc: `${SITE_URL}/${basePath}/${encodeURIComponent(String(item.slug))}`,
      lastmod: dateOnly(item._updatedAt || item.posted || item._createdAt || item.deadline),
      changefreq: "daily" as const,
      priority,
    }));
}

function uniqueEntries(entries: SitemapEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.loc)) return false;
    seen.add(entry.loc);
    return true;
  });
}

function renderXml(entries: SitemapEntry[]) {
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
    )
    .join("\n\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export const handler: Handler = async () => {
  const entries = staticEntries();

  try {
    const [jobs, bursaries, universities] = await Promise.all([
      fetchSanityItems("job"),
      fetchSanityItems("bursary"),
      fetchSanityItems("university"),
    ]);

    entries.push(...opportunityEntries(jobs, "jobs", "0.85"));
    entries.push(...opportunityEntries(bursaries, "bursary", "0.85"));
    entries.push(...opportunityEntries(universities, "varsity", "0.8"));
  } catch (error) {
    console.error("Dynamic sitemap Sanity fetch failed:", error);
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
    },
    body: renderXml(uniqueEntries(entries)),
  };
};
