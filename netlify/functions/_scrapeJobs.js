// netlify/functions/_scrapeJobs.js
function absUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function stripTags(s = "") {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function fetchLatestJobFromSite() {
  const indexUrl = process.env.CAREERUNIFIED_JOBS_INDEX_URL;
  if (!indexUrl) throw new Error("Missing CAREERUNIFIED_JOBS_INDEX_URL");

  const indexResp = await fetch(indexUrl);
  if (!indexResp.ok) throw new Error(`Failed to fetch jobs index: ${indexResp.status}`);
  const html = await indexResp.text();

  // Find first /jobs/... link (assumes newest first)
  const linkMatches = [...html.matchAll(/href="([^"]*\/jobs\/[^"]+)"/gi)]
    .map((m) => m[1])
    .map((href) => absUrl(indexUrl, href))
    .filter(Boolean);

  const unique = [...new Set(linkMatches)];
  if (!unique.length) throw new Error("No job links found on index page");

  const jobUrl = unique[0];

  const jobResp = await fetch(jobUrl);
  if (!jobResp.ok) throw new Error(`Failed to fetch job page: ${jobResp.status}`);
  const jobHtml = await jobResp.text();

  const title =
    stripTags(jobHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "") ||
    stripTags(jobHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "") ||
    "Untitled job";

  // Light extraction (safe fallbacks)
  const company = stripTags(jobHtml.match(/Company:\s*<\/strong>\s*([^<]+)/i)?.[1] || "") || "Not specified";
  const location = stripTags(jobHtml.match(/Location:\s*<\/strong>\s*([^<]+)/i)?.[1] || "") || "Not specified";
  const salary = stripTags(jobHtml.match(/Salary:\s*<\/strong>\s*([^<]+)/i)?.[1] || "") || "";
  const closingDate = stripTags(jobHtml.match(/Closing:\s*<\/strong>\s*([^<]+)/i)?.[1] || "") || "";

  return { title, company, location, salary, closingDate, url: jobUrl };
}
