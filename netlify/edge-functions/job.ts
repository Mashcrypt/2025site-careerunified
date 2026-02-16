import { getJobBySlug } from "../lib/sanity.ts";

function escapeAttr(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function snippet(text: string, maxLen = 220) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trim() + "…";
}

export default async (request: Request) => {
  try {
    const url = new URL(request.url);

    // /jobs/<slug>
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? parts[1] : null;

    // If it's just /jobs (no slug), let the site handle normally
    if (!slug || slug === "jobs") return fetch(request);

    const job = await getJobBySlug(slug);

    // If slug doesn't exist, let SPA handle (keeps UX smooth)
    if (!job) return fetch(request);

    const companyName = job.companyName || "Confidential";
    const jobTitle = job.title || "Job Opportunity";
    const shareUrl = `https://careerunified.com/jobs/${slug}`;

    // OG image (company logo) fallback to site icon
    const image =
      job.companyLogo ||
      "https://careerunified.com/android-chrome-512x512.png";

    const salaryLine = job.salary ? `Salary: ${job.salary}. ` : "";
    const locationLine = job.location ? `Location: ${job.location}. ` : "";
    const desc = snippet(job.description || "", 220);

    const ogTitle = `${jobTitle} – Career Unified`;
    const ogDescription = `${companyName}. ${locationLine}${salaryLine}${desc}`.trim();

    // Redirect humans to SPA jobs page, and let your JS open slug from URL
    // (We keep the original slug in the path for your current openFromURL logic)
    const redirectTo = `/jobs.html?slug=${encodeURIComponent(slug)}`;


    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeAttr(ogTitle)}</title>
  <meta name="description" content="${escapeAttr(ogDescription)}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Career Unified" />
  <meta property="og:title" content="${escapeAttr(ogTitle)}" />
  <meta property="og:description" content="${escapeAttr(ogDescription)}" />
  <meta property="og:image" content="${escapeAttr(image)}" />
  <meta property="og:url" content="${escapeAttr(shareUrl)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(ogTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(ogDescription)}" />
  <meta name="twitter:image" content="${escapeAttr(image)}" />

  <meta http-equiv="refresh" content="0; url=${escapeAttr(redirectTo)}" />
</head>
<body>
  <h1>${escapeAttr(jobTitle)}</h1>
  <p>${escapeAttr(companyName)}</p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch {
    return new Response("Edge function error", { status: 500 });
  }
};

