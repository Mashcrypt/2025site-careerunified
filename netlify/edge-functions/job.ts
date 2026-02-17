import { getJobBySlug } from "../lib/sanity.ts";

function escapeAttr(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function snippet(text: string, maxLen = 140) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trim() + "…";
}

// Detect social media bots / link preview scrapers
function isSocialCrawler(ua: string) {
  const s = (ua || "").toLowerCase();
  return (
    s.includes("whatsapp") ||
    s.includes("facebookexternalhit") ||
    s.includes("facebot") ||
    s.includes("twitterbot") ||
    s.includes("telegrambot") ||
    s.includes("slackbot") ||
    s.includes("discordbot") ||
    s.includes("linkedinbot") ||
    s.includes("pinterest") ||
    s.includes("googlebot") ||
    s.includes("bingbot")
  );
}

export default async (request: Request) => {
  try {
    const url = new URL(request.url);

    // /jobs/<slug>
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? parts[1] : null;

    if (!slug || slug === "jobs") return fetch(request);

    const redirectTo = `/jobs.html?slug=${encodeURIComponent(slug)}`;

    const ua = request.headers.get("user-agent") || "";

    // ✅ Humans: do a REAL redirect = no flash
    if (!isSocialCrawler(ua)) {
      return new Response(null, {
        status: 302,
        headers: {
          location: redirectTo,
          "cache-control": "no-store"
        }
      });
    }

    // ✅ Crawlers: return OG HTML so WhatsApp preview works
    const job = await getJobBySlug(slug);
    if (!job) return fetch(request);

    const companyName = job.companyName || "Confidential";
    const jobTitle = job.title || "Job Opportunity";
    const shareUrl = `https://careerunified.com/jobs/${slug}`;

    const image =
      job.companyLogo || "https://careerunified.com/android-chrome-512x512.png";

    // ❌ no closing date in preview
    const salaryText = job.salary ? job.salary : "Not specified";
    const locationText = job.location ? job.location : "South Africa";
    const desc = snippet(job.description || "", 140);

    const ogTitle = `${jobTitle} – Career Unified`;
    const ogDescription = `${companyName} • ${locationText} • Salary: ${salaryText} • ${desc}`.trim();

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
