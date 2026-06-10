import {getUniversityBySlug} from "../lib/sanity.ts";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
}

function detailRow(label: string, value: unknown) {
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not specified")}</strong></div>`;
}

export default async (request: Request) => {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? parts[1] : "";

    if (!slug || slug === "varsity") {
      return Response.redirect("https://careerunified.com/varsity.html", 301);
    }

    const university = await getUniversityBySlug(slug);
    if (!university) {
      return new Response("University not found", {
        status: 404,
        headers: {"content-type": "text/plain; charset=utf-8"},
      });
    }

    const name = university.name || "University";
    const deadline = normalizeDate(university.deadline);
    const closed = Boolean(deadline && deadline < new Date().toISOString().slice(0, 10));
    const shareUrl = `https://careerunified.com/varsity/${encodeURIComponent(slug)}`;
    const pageTitle = `${name} Application Fees and Registration | Career Unified`;
    const description = `Check ${name} application fees, registration fees, application deadline and official application information.`;

    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${shareUrl}#webpage`,
          url: shareUrl,
          name: pageTitle,
          description,
          mainEntity: {"@id": `${shareUrl}#university`},
          isPartOf: {
            "@type": "WebSite",
            name: "Career Unified",
            url: "https://careerunified.com/",
          },
        },
        {
          "@type": "CollegeOrUniversity",
          "@id": `${shareUrl}#university`,
          name,
          url: shareUrl,
          sameAs: university.applicationLink || undefined,
          address: university.city || university.province
            ? {
                "@type": "PostalAddress",
                addressLocality: university.city || undefined,
                addressRegion: university.province || undefined,
                addressCountry: "ZA",
              }
            : undefined,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {"@type": "ListItem", position: 1, name: "Home", item: "https://careerunified.com/"},
            {"@type": "ListItem", position: 2, name: "Universities", item: "https://careerunified.com/varsity.html"},
            {"@type": "ListItem", position: 3, name, item: shareUrl},
          ],
        },
      ],
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-snippet:-1">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Career Unified">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="https://careerunified.com/android-chrome-512x512.png">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonLd(schema)}</script>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#f7f9fc;color:#111827;line-height:1.65}
    header{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:44px 20px}
    main,.inner{max-width:960px;margin:0 auto}
    main{padding:28px 20px 54px}
    h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.1;margin:20px 0 12px}
    .brand a{color:#fff;text-decoration:none;font-weight:700}
    .meta{color:#dbeafe;font-size:1.05rem}
    .panel{background:#fff;border:1px solid #dbeafe;border-radius:8px;box-shadow:0 16px 38px rgba(30,58,138,.12);padding:22px;margin:20px 0}
    .details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .detail-row{border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#fbfdff}
    .detail-row span{display:block;color:#64748b;font-size:.86rem;font-weight:700}
    .detail-row strong{display:block;color:#111827}
    .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}
    .btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:12px 16px;font-weight:800;text-decoration:none}
    .btn.green{background:#16a34a;color:#fff}.btn.light{background:#eaf1fb;color:#1e3a8a}
    @media(max-width:680px){.details{grid-template-columns:1fr}.actions{flex-direction:column}.btn{width:100%}}
  </style>
</head>
<body>
  <header>
    <div class="inner">
      <div class="brand"><a href="https://careerunified.com/">Career Unified</a></div>
      <h1>${escapeHtml(name)}</h1>
      <div class="meta">University application and registration information</div>
      ${closed ? '<div class="meta"><strong>Applications closed for the listed intake</strong></div>' : ""}
    </div>
  </header>
  <main>
    <section class="panel">
      <div class="details">
        ${detailRow("Application fee", university.applicationFee || "Not specified")}
        ${detailRow("Registration fee", university.registrationFee || "Not specified")}
        ${detailRow("Application deadline", deadline || "TBA")}
        ${detailRow("Application status", closed ? "Closed" : "Open or upcoming")}
      </div>
      <div class="actions">
        ${university.applicationLink ? `<a class="btn green" href="${escapeHtml(university.applicationLink)}" target="_blank" rel="noopener noreferrer">Visit official application page</a>` : ""}
        <a class="btn light" href="https://careerunified.com/varsity.html">Browse all universities</a>
      </div>
    </section>
    ${university.notes ? `<section class="panel"><h2>Application information</h2><p>${escapeHtml(university.notes)}</p></section>` : ""}
    <section class="panel">
      <p>Fees and deadlines can change. Confirm the final amount and application requirements on the university's official website before making payment.</p>
    </section>
  </main>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    console.error("varsity edge error:", error);
    return new Response("Unable to load university", {status: 500});
  }
};
