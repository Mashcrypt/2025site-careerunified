export default async (request: Request) => {
  const url = new URL(request.url);

  // ✅ Works for:
  // /bursary?slug=testing-bursary
  // /bursary/testing-bursary (optional)
  const qsSlug = url.searchParams.get("slug")?.trim();
  const pathSlug = url.pathname.split("/").filter(Boolean).pop();
  const slug = qsSlug || (pathSlug && pathSlug !== "bursary" ? pathSlug : "");

  if (!slug) return new Response("Missing slug", { status: 400 });

  const projectId = Deno.env.get("SANITY_PROJECT_ID")!;
  const dataset = Deno.env.get("SANITY_DATASET")!;
  const apiVersion = Deno.env.get("SANITY_API_VERSION") || "2024-01-01";

  const groq = `*[_type=="bursary" && slug.current==$slug][0]{
    name,
    description,
    "slug": slug.current,
    provider,
    faculty,
    deadline,
    applicationLink,
    "logoRef": providerLogo.asset->_ref
  }`;

  const params = encodeURIComponent(JSON.stringify({ slug }));
  const query = encodeURIComponent(groq);

  const sanityUrl =
    `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${query}&$params=${params}`;

  let data: any = null;
  try {
    const res = await fetch(sanityUrl);
    const json = await res.json();
    data = json?.result || null;
  } catch {
    data = null;
  }

  // If not found, still return an OG page (better than redirect for crawlers)
  if (!data) {
    const fallbackHtml = buildHtml({
      title: "Bursaries & Scholarships South Africa – Career Unified",
      desc: "Discover bursaries, scholarships, and funding opportunities for students in South Africa.",
      ogUrl: `https://careerunified.com/bursary?slug=${encodeURIComponent(slug)}`,
      ogImage: "https://careerunified.com/images/social-share-bursaries.png",
      redirectTo: `https://careerunified.com/bursaries.html?slug=${encodeURIComponent(slug)}`
    });

    return new Response(fallbackHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const title = `${data.name} – Career Unified`;
  const desc = (data.description || "").toString().slice(0, 160);

  // ✅ Make og:url match the shared URL
  const ogUrl = `https://careerunified.com/bursary?slug=${encodeURIComponent(data.slug)}`;

  // ✅ Build a 1200x630 Sanity CDN image if we have an asset ref
  const ogImage =
    sanityRefToOgImageUrl(data.logoRef, projectId, dataset) ||
    "https://careerunified.com/images/social-share-bursaries.png";

  // Humans land here (your SPA page)
  const redirectTo = `https://careerunified.com/bursaries.html?slug=${encodeURIComponent(data.slug)}`;

  const html = buildHtml({ title, desc, ogUrl, ogImage, redirectTo });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // During testing, avoid WhatsApp caching old previews
      "cache-control": "no-store",
    },
  });
};

function buildHtml(opts: {
  title: string;
  desc: string;
  ogUrl: string;
  ogImage: string;
  redirectTo: string;
}) {
  const { title, desc, ogUrl, ogImage, redirectTo } = opts;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>

<meta name="description" content="${escapeHtml(desc)}" />

<meta property="og:site_name" content="Career Unified" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtml(ogUrl)}" />

<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:secure_url" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />

<meta http-equiv="refresh" content="0; url=${escapeHtml(redirectTo)}" />
</head>
<body>
<script>location.replace(${JSON.stringify(redirectTo)})</script>
</body>
</html>`;
}

// Converts Sanity image asset ref -> 1200x630 CDN URL
// ref looks like: "image-<assetId>-<w>x<h>-<format>"
function sanityRefToOgImageUrl(ref: string | null | undefined, projectId: string, dataset: string) {
  if (!ref || typeof ref !== "string") return "";
  if (!ref.startsWith("image-")) return "";

  const parts = ref.split("-");
  const assetId = parts[1];
  const format = parts[3] || "png";
  if (!assetId) return "";

  // ✅ 1200x630 is best for WhatsApp previews
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${assetId}-1200x630.${format}`;
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
