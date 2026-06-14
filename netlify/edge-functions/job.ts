import { getJobBySlug } from "../lib/sanity.ts";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(value: unknown, maxLen = 155) {
  const cleaned = stripHtml(value);
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3).trim() + "...";
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().slice(0, 10);
}

function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function detailRow(label: string, value: unknown) {
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not specified")}</strong></div>`;
}

function formatParagraphs(value: unknown) {
  const cleaned = stripHtml(value);
  if (!cleaned) return "<p>Description not provided.</p>";
  const sentences = cleaned.match(/[^.]+(?:\.|$)/g) || [];
  const chunks = sentences.length > 1 ? sentences : [cleaned];
  return chunks
    .slice(0, 18)
    .map((part) => `<p>${escapeHtml(part.trim())}</p>`)
    .join("");
}

function employmentType(value: unknown) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("part")) return "PART_TIME";
  if (normalized.includes("intern") || normalized.includes("graduate")) return "INTERN";
  if (normalized.includes("temporary")) return "TEMPORARY";
  if (normalized.includes("contract")) return "CONTRACTOR";
  if (normalized.includes("full")) return "FULL_TIME";
  return "OTHER";
}

export default async (request: Request) => {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? parts[1] : null;

    if (!slug || slug === "jobs") {
      return Response.redirect("https://careerunified.com/jobs.html", 301);
    }

    const job = await getJobBySlug(slug);
    if (!job) {
      return new Response("Job not found", {
        status: 404,
        headers: {"content-type": "text/plain; charset=utf-8"},
      });
    }

    const companyName = job.companyName || "Confidential";
    const jobTitle = job.title || "Job Opportunity";
    const shareUrl = `https://careerunified.com/jobs/${slug}`;
    const image = job.companyLogo || "https://careerunified.com/android-chrome-512x512.png";
    const salaryText = job.salary || "Not specified";
    const locationText = job.location || "South Africa";
    const postedDate = normalizeDate(job.posted);
    const deadlineDate = normalizeDate(job.deadline);
    const expired = Boolean(deadlineDate && deadlineDate < new Date().toISOString().slice(0, 10));
    const description = stripHtml(job.description);
    const metaDescription = `${companyName} - ${locationText} - Salary: ${salaryText} - ${snippet(description)}`.trim();
    const pageTitle = `${jobTitle} at ${companyName} | Career Unified`;

    const graph: Array<Record<string, unknown>> = [
      {
        "@type": "WebPage",
        "@id": `${shareUrl}#webpage`,
        url: shareUrl,
        name: pageTitle,
        description: snippet(description),
        isPartOf: {
          "@type": "WebSite",
          name: "Career Unified",
          url: "https://careerunified.com/",
        },
        breadcrumb: {"@id": `${shareUrl}#breadcrumb`},
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${shareUrl}#breadcrumb`,
        itemListElement: [
          {"@type": "ListItem", position: 1, name: "Home", item: "https://careerunified.com/"},
          {"@type": "ListItem", position: 2, name: "Jobs", item: "https://careerunified.com/jobs.html"},
          {"@type": "ListItem", position: 3, name: jobTitle, item: shareUrl},
        ],
      },
    ];

    if (!expired) {
      graph.push({
        "@type": "JobPosting",
        title: jobTitle,
        description: description || snippet(description),
        datePosted: postedDate || undefined,
        validThrough: deadlineDate ? `${deadlineDate}T23:59:59+02:00` : undefined,
        employmentType: employmentType(job.jobType),
        hiringOrganization: {
          "@type": "Organization",
          name: companyName,
          logo: image,
        },
        jobLocation: {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: locationText,
            addressCountry: "ZA",
          },
        },
        url: shareUrl,
      });
    }

    const schema = {
      "@context": "https://schema.org",
      "@graph": graph,
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <meta name="robots" content="${expired ? "noindex, follow" : "index, follow, max-snippet:-1, max-image-preview:large"}">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Career Unified">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(metaDescription)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(metaDescription)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <script type="application/ld+json">${jsonLd(schema)}</script>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#f7f9fc;color:#111827;line-height:1.65}
    header{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:44px 20px}
    main,.inner{max-width:960px;margin:0 auto}
    main{padding:28px 20px 54px}
    a{color:#1d4ed8}
    .brand a{color:#fff;text-decoration:none;font-weight:700}
    h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.1;margin:20px 0 12px}
    .meta{font-size:1.05rem;color:#dbeafe}
    .panel{background:#fff;border:1px solid #dbeafe;border-radius:18px;box-shadow:0 16px 38px rgba(30,58,138,.12);padding:22px;margin:20px 0}
    .details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .detail-row{border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fbfdff}
    .detail-row span{display:block;color:#64748b;font-size:.86rem;font-weight:700}
    .detail-row strong{display:block;color:#111827}
    .description p{margin:0 0 14px}
    .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}
    .btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:12px 16px;font-weight:800;text-decoration:none}
    .btn.green{background:#16a34a;color:#fff}
    .btn.blue{background:#2563eb;color:#fff}
    .btn.light{background:#eaf1fb;color:#1e3a8a}
    @media(max-width:680px){
      main{display:flex;flex-direction:column}
      .description{order:-1}
      .description h2{margin-top:0}
      .details{grid-template-columns:1fr}
      .actions{flex-direction:column}
      .btn{box-sizing:border-box;width:100%}
    }
  </style>
</head>
<body>
  <header>
    <div class="inner">
      <div class="brand"><a href="https://careerunified.com/">Career Unified</a></div>
      <h1>${escapeHtml(jobTitle)}</h1>
      <div class="meta">${escapeHtml(companyName)} - ${escapeHtml(locationText)}</div>
      ${expired ? '<div class="meta"><strong>Applications closed</strong></div>' : ""}
    </div>
  </header>
  <main>
    <section class="panel">
      <div class="details">
        ${detailRow("Company", companyName)}
        ${detailRow("Location", locationText)}
        ${detailRow("Salary", salaryText)}
        ${detailRow("Closing date", deadlineDate || job.deadline || "Not specified")}
        ${detailRow("Date posted", postedDate || job.posted || "Not specified")}
        ${detailRow("Employment type", job.jobType || "Full-time")}
      </div>
      <div class="actions">
        ${!expired && job.applyLink ? `<a class="btn green" href="${escapeHtml(job.applyLink)}" target="_blank" rel="noopener noreferrer">Apply on employer website</a>` : ""}
        <a class="btn light" href="https://careerunified.com/jobs.html">Browse current jobs</a>
        <a class="btn blue" href="https://careerunified.com/cv-generator/?tab=ai&source=job">Tailor CV</a>
        <a class="btn light" href="https://careerunified.com/z83-filler">Fill Z83</a>
      </div>
    </section>
    <section class="panel description">
      <h2>Job Description</h2>
      ${formatParagraphs(job.description)}
    </section>
  </main>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("job edge error:", err);
    return new Response("Edge function error", {status: 500});
  }
};
