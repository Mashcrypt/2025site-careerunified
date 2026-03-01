// netlify/edge-functions/bursary-og.ts

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

type Bursary = {
  name?: string;
  description?: string;
  provider?: string;
  faculty?: string;
  deadline?: string;
  slug?: string;
  providerLogoUrl?: string | null;
};

async function getBursaryBySlug(slug: string): Promise<Bursary | null> {
  const projectId = Deno.env.get("SANITY_PROJECT_ID");
  const dataset = Deno.env.get("SANITY_DATASET");
  const apiVersion = Deno.env.get("SANITY_API_VERSION") || "2024-01-01";
  const token = Deno.env.get("SANITY_READ_TOKEN"); // optional (only needed if dataset is private)

  if (!projectId || !dataset) return null;

  const groq = `*[_type=="bursary" && slug.current==$slug][0]{
    name,
    description,
    provider,
    faculty,
    deadline,
    "slug": slug.current,
    "providerLogoUrl": providerLogo.asset->url
  }`;

  const query = encodeURIComponent(groq);
  const params = encodeURIComponent(JSON.stringify({ slug }));

  const sanityUrl = `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${query}&$params=${params}`;

  const res = await fetch(sanityUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });

  if (!res.ok) return null;

  const json = await res.json();
  return (json?.result as Bursary) || null;
}

export default async (request: Request) => {
  try {
    const url = new URL(request.url);

    // /bursary/<slug>
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? parts[1] : null;

    // If someone hits /bursary or /bursary/ with no slug, just let Netlify serve normally
    if (!slug || slug === "bursary") return fetch(request);

    // Humans land in SPA (your preview panel will auto-open using ?slug=)
    const redirectTo = `/bursaries.html?slug=${encodeURIComponent(slug)}`;

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
    const bursary = await getBursaryBySlug(slug);
    if (!bursary) return fetch(request);

    const bursaryName = bursary.name || "Bursary Opportunity";
    const providerName = bursary.provider || "Provider";
    const facultyText = bursary.faculty ? ` • ${bursary.faculty}` : "";
    const deadlineText = bursary.deadline ? ` • Deadline: ${bursary.deadline}` : "";

    const shareUrl = `https://careerunified.com/bursary/${slug}`;

    const image =
      bursary.providerLogoUrl ||
      "https://careerunified.com/android-chrome-512x512.png";

    const desc = snippet(bursary.description || "", 140);

    const ogTitle = `${bursaryName} – Career Unified`;
    const ogDescription = `${providerName}${facultyText}${deadlineText}${desc ? " • " + desc : ""}`.trim();

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
  <h1>${escapeAttr(bursaryName)}</h1>
  <p>${escapeAttr(providerName)}</p>
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
