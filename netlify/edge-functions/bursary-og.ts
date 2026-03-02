import { getBursaryBySlug } from "../lib/sanity.ts";

function escapeAttr(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;"); // ✅ correct
}

function snippet(text: string, maxLen = 140) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trim() + "…";
}

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

function ensureHttps(url: string) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return "https://" + u;
}

export default async (request: Request) => {
  try {
    const url = new URL(request.url);

    // /bursary/<slug>
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? parts[1] : null;

    // If someone hits /bursary or /bursary/ with no slug, do nothing special
    if (!slug || slug === "bursary") return fetch(request);

    // Humans: your SPA opens it using ?slug=
    const redirectTo = `/bursaries.html?slug=${encodeURIComponent(slug)}`;
    const ua = request.headers.get("user-agent") || "";

    // ✅ Humans: real redirect (same behavior as jobs)
    if (!isSocialCrawler(ua)) {
      return new Response(null, {
        status: 302,
        headers: {
          location: redirectTo,
          "cache-control": "no-store",
        },
      });
    }

    // ✅ Crawlers: return OG HTML so WhatsApp preview works
    const bursary = await getBursaryBySlug(slug);
    if (!bursary) return fetch(request);

    const bursaryName = bursary.name || "Bursary Opportunity";
    const providerName = bursary.provider || "Provider";

    const facultyText = bursary.faculty ? ` • ${bursary.faculty}` : "";
    const deadlineText = bursary.deadline ? ` • Deadline: ${bursary.deadline}` : "";
    const desc = snippet(bursary.description || "", 140);

    const shareUrl = `https://careerunified.com/bursary/${slug}`;

    const image = ensureHttps(
      bursary.providerLogoUrl || "https://careerunified.com/android-chrome-512x512.png"
    );

    const ogTitle = `${bursaryName} – Career Unified`;
    const ogDescription = `${providerName}${facultyText}${deadlineText}${
      desc ? " • " + desc : ""
    }`.trim();

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
  <meta property="og:image:secure_url" content="${escapeAttr(image)}" />
  <meta property="og:url" content="${escapeAttr(shareUrl)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(ogTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(ogDescription)}" />
  <meta name="twitter:image" content="${escapeAttr(image)}" />
</head>
<body>
  <h1>${escapeAttr(bursaryName)}</h1>
  <p>${escapeAttr(providerName)}</p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("bursary-og edge error:", err);
    return new Response("Edge function error", { status: 500 });
  }
};
