import type {Handler} from "@netlify/functions";

const SITE_URL = "https://careerunified.com";
const PROJECT_ID = process.env.VITE_SANITY_PROJECT_ID || "qjg5raj1";
const DATASET = process.env.VITE_SANITY_DATASET || "production";
const API_VERSION = "2023-10-01";

type SitemapEntry = {
  loc: string;
  lastmod: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: string;
};

type SanityItem = {
  slug?: string;
  _updatedAt?: string;
  _createdAt?: string;
  posted?: string;
  deadline?: string;
};

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
  const now = today();
  return [
    {loc: `${SITE_URL}/`, lastmod: now, changefreq: "weekly", priority: "1.0"},
    {loc: `${SITE_URL}/jobs.html`, lastmod: now, changefreq: "daily", priority: "0.9"},
    {loc: `${SITE_URL}/bursaries.html`, lastmod: now, changefreq: "daily", priority: "0.9"},
    {loc: `${SITE_URL}/varsity.html`, lastmod: now, changefreq: "weekly", priority: "0.85"},
    {loc: `${SITE_URL}/cv-tips`, lastmod: now, changefreq: "weekly", priority: "0.85"},
    {loc: `${SITE_URL}/cv-generator/`, lastmod: now, changefreq: "monthly", priority: "0.8"},
    {loc: `${SITE_URL}/z83-filler`, lastmod: now, changefreq: "monthly", priority: "0.8"},
    {loc: `${SITE_URL}/about-us.html`, lastmod: now, changefreq: "monthly", priority: "0.6"},
    {loc: `${SITE_URL}/contact-us.html`, lastmod: now, changefreq: "monthly", priority: "0.5"},
    {loc: `${SITE_URL}/privacy.html`, lastmod: now, changefreq: "yearly", priority: "0.3"},
    {loc: `${SITE_URL}/terms.html`, lastmod: now, changefreq: "yearly", priority: "0.3"},
  ];
}

async function fetchSanityItems(type: "job" | "bursary", limit = 2000): Promise<SanityItem[]> {
  const slugPath = `"slug": slug.current`;
  const query = `*[_type == "${type}" && defined(slug.current) && (!defined(deadline) || deadline >= "${today()}")] | order(coalesce(_updatedAt, _createdAt) desc)[0...${limit}]{
    ${slugPath},
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
  return Array.isArray(data?.result) ? data.result : [];
}

function opportunityEntries(items: SanityItem[], basePath: "jobs" | "bursary", priority: string): SitemapEntry[] {
  return items
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
    const [jobs, bursaries] = await Promise.all([
      fetchSanityItems("job"),
      fetchSanityItems("bursary"),
    ]);

    entries.push(...opportunityEntries(jobs, "jobs", "0.85"));
    entries.push(...opportunityEntries(bursaries, "bursary", "0.85"));
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
