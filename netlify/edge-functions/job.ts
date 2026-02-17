// netlify/edge-functions/job.ts
import { getJobBySlug } from "../lib/sanity.ts";

function escapeAttr(str: string) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function snippet(text: string, maxLen = 160) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trim() + "…";
}

function isBot(ua: string) {
  const s = (ua || "").toLowerCase();
  return /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|pinterest|embedly|quora link preview|googlebot|bingbot|duckduckbot|baiduspider|yandexbot|crawler|spider|bot/.test(
    s
  );
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
    const shareUrl = `https://careerunified.com/jobs/${encodeURIComponent(slug)}`;

    // Company logo for OG, fallback to your icon
    const image =
      job.companyLogo || "https://careerunified.com/android-chrome-512x512.png";

    // ✅ NO closing date in preview (as requested)
    const salaryText = job.salary ? `Salary: ${job.salary}` : "Salary: Not specified";
    const locationText = job.location ? job.location : "South Africa";
    const desc = snippet(job.description || "", 160);

    const ogTitle = `${jobTitle} – Career Unified`;
    const ogDescription = `${companyName} • ${locationText} • ${salaryText}. ${desc}`.trim();

    // Humans should go straight to your main jobs page (no flashing slug page)
    const redirectTo = `/jobs.html?slug=${encodeURIComponent(slug)}`;

    const ua = request.headers.get("user-agent") || "";
    const bot = isBot(ua);

    // Bots need the OG HTML (no redirect)
    // Humans get a clean 302 redirect (no “slug page flash”)
    if (!bot) {
      return new Response(null, {
        status: 302,
        headers: {
          location: redirectTo,
          "cache-control": "no-store"
        }
      });
    }

    // Bot HTML with OG tags
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


