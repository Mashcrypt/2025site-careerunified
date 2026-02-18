export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  const slug = url.pathname.split("/").filter(Boolean).pop();

  if (!slug) return new Response("Missing slug", { status: 400 });

  // IMPORTANT: set these in Netlify env vars
  const projectId = Deno.env.get("SANITY_PROJECT_ID")!;
  const dataset = Deno.env.get("SANITY_DATASET")!;
  const apiVersion = Deno.env.get("SANITY_API_VERSION") || "2024-01-01";

  // Public CDN query (works if your dataset is public readable)
  const groq = `*[_type=="bursary" && slug.current==$slug][0]{
    name,
    description,
    "slug": slug.current,
    provider,
    faculty,
    deadline,
    applicationLink,
    "logo": providerLogo.asset->url
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

  // Fallback if not found
  if (!data) {
    return Response.redirect("https://careerunified.com/bursaries.html", 302);
  }

  const title = `${data.name} – Career Unified`;
  const desc = (data.description || "").toString().slice(0, 160);
  const ogUrl = `https://careerunified.com/bursaries/${data.slug}`;
  const ogImage =
    data.logo ||
    "https://careerunified.com/images/social-share-bursaries.png";

  // Humans should land in bursaries.html with slug param
  const redirectTo = `https://careerunified.com/bursaries.html?slug=${encodeURIComponent(data.slug)}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>

<meta name="description" content="${escapeHtml(desc)}" />

<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${ogUrl}" />
<meta property="og:image" content="${ogImage}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${ogImage}" />

<meta http-equiv="refresh" content="0; url=${redirectTo}" />
</head>
<body>
<script>location.replace(${JSON.stringify(redirectTo)})</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
};

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
