import {getActiveJobs, getJobBySlug} from "../lib/sanity.ts";
import {getRecruiterJobs, isActiveRecruiterJob} from "../lib/firestore.ts";
import {
  renderSiteFooter,
  renderSiteNavigation,
  renderSiteNavigationScript,
  SITE_SHELL_STYLES,
} from "../lib/siteShell.ts";

const ANALYTICS_ID = "G-2Z934XRVXT";

type JobSummary = {
  slug?: string;
  title?: string;
  posted?: string;
};

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
  return `${cleaned.slice(0, maxLen - 3).trim()}...`;
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value: unknown) {
  const normalized = normalizeDate(value);
  if (!normalized) return "";
  const date = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return normalized;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function closingDateLabel(job: Record<string, unknown>, normalizedDate = "") {
  return String(
    job.deadlineText || formatDisplayDate(normalizedDate || job.deadline) || "Not specified",
  ).trim();
}

function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function safeHttpUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function safeApplicationUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["https:", "http:", "mailto:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function factCard(label: string, value: unknown, modifier: string) {
  return `<div class="fact-card fact-card--${modifier}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value || "Not specified")}</strong>
  </div>`;
}

function formatDescription(value: unknown) {
  const cleaned = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || "Description not provided.";
}

function renderDescriptionLink(url: string, label: string) {
  const cleanUrl = safeHttpUrl(url);
  if (!cleanUrl) return escapeHtml(label || url);

  const isInternal = new URL(cleanUrl).origin === "https://careerunified.com";
  const targetAttrs = isInternal ? "" : ' target="_blank" rel="noopener noreferrer"';
  return `<a class="description-link" href="${escapeHtml(cleanUrl)}"${targetAttrs}>${escapeHtml(label || cleanUrl)}</a>`;
}

function formatDescriptionHtml(value: unknown) {
  const cleaned = formatDescription(value);
  const linkPattern = /\[([^\]\n]+)\]\s*\(\s*(https?:\/\/[^\s<>"')]+)\s*\)|\(\s*(https?:\/\/[^\s<>"')]+)\s*\)\s*\[([^\]\n]+)\]|\bhttps?:\/\/[^\s<>"']+/gi;
  let output = "";
  let lastIndex = 0;

  cleaned.replace(linkPattern, (match, label, markdownUrl, reversedUrl, reversedLabel, offset) => {
    const url = markdownUrl || reversedUrl || match;
    const punctuation = markdownUrl || reversedUrl ? "" : (url.match(/[).,!?;:]+$/)?.[0] || "");
    const cleanUrl = punctuation ? url.slice(0, -punctuation.length) : url;
    const linkLabel = markdownUrl
      ? String(label).trim()
      : reversedUrl
        ? String(reversedLabel).trim()
        : cleanUrl;

    output += escapeHtml(cleaned.slice(lastIndex, offset));
    output += renderDescriptionLink(cleanUrl, linkLabel);
    output += escapeHtml(punctuation);
    lastIndex = offset + match.length;
    return match;
  });

  output += escapeHtml(cleaned.slice(lastIndex));
  return output;
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
    const slug = parts.length >= 2 ? decodeURIComponent(parts[1]) : null;

    if (!slug || slug === "jobs") {
      return Response.redirect("https://careerunified.com/jobs", 301);
    }

    const [sanityJob, sanityJobs, recruiterJobs] = await Promise.all([
      getJobBySlug(slug).catch((error) => {
        console.error("job lookup error:", error);
        return null;
      }),
      getActiveJobs().catch((error) => {
        console.error("adjacent jobs fetch error:", error);
        return [];
      }),
      getRecruiterJobs().catch((error) => {
        console.error("recruiter jobs fetch error:", error);
        return [];
      }),
    ]);
    const job = sanityJob ||
      recruiterJobs.find((item: JobSummary) => item.slug === slug) ||
      null;
    if (!job) {
      return new Response("Job not found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=60",
        },
      });
    }

    const activeJobs = [
      ...sanityJobs,
      ...recruiterJobs.filter(isActiveRecruiterJob),
    ].sort((a: JobSummary, b: JobSummary) =>
      new Date(b.posted || 0).getTime() - new Date(a.posted || 0).getTime()
    );

    const companyName = String(job.companyName || "Confidential").trim();
    const jobTitle = String(job.title || "Job Opportunity").trim();
    const canonicalSlug = String(job.slug || slug).trim();
    if (canonicalSlug !== slug) {
      return Response.redirect(`https://careerunified.com/jobs/${encodeURIComponent(canonicalSlug)}`, 301);
    }

    const shareUrl = `https://careerunified.com/jobs/${encodeURIComponent(canonicalSlug)}`;
    const image = safeHttpUrl(job.companyLogo) || "https://careerunified.com/android-chrome-512x512.png";
    const applyUrl = safeApplicationUrl(job.applyLink);
    const salaryText = String(job.salary || "Not specified").trim();
    const locationText = String(job.location || "South Africa").trim();
    const postedDate = normalizeDate(job.posted);
    const postedLabel = formatDisplayDate(postedDate) || job.posted || "Not specified";
    const deadlineDate = normalizeDate(job.deadline);
    const deadlineLabel = closingDateLabel(job, deadlineDate);
    const expired = Boolean(deadlineDate && deadlineDate < new Date().toISOString().slice(0, 10));
    const statusText = expired ? "Applications closed" : "Applications open";
    const description = stripHtml(job.description);
    const metaDescription = snippet(
      `${jobTitle} at ${companyName} in ${locationText}. Salary: ${salaryText}. ${description}`,
      165,
    );
    const pageTitle = `${jobTitle} at ${companyName} | Career Unified`;

    const currentIndex = activeJobs.findIndex((item: JobSummary) => item.slug === canonicalSlug);
    const previousJob = currentIndex > 0 ? activeJobs[currentIndex - 1] : null;
    const nextJob = currentIndex >= 0 && currentIndex < activeJobs.length - 1
      ? activeJobs[currentIndex + 1]
      : null;
    const previousUrl = previousJob?.slug
      ? `/jobs/${encodeURIComponent(previousJob.slug)}`
      : "";
    const nextUrl = nextJob?.slug
      ? `/jobs/${encodeURIComponent(nextJob.slug)}`
      : "";

    const aiTailorPayload = {
      title: jobTitle,
      company: companyName,
      location: locationText,
      salary: salaryText,
      closingDate: deadlineLabel,
      description: String(job.description ?? "").trim(),
      fullText: [
        `Job Title: ${jobTitle}`,
        `Company: ${companyName}`,
        `Location: ${locationText}`,
        `Salary: ${salaryText}`,
        `Closing Date: ${deadlineLabel}`,
        "",
        "Job Description:",
        String(job.description ?? "").trim(),
      ].join("\n"),
    };

    const graph: Array<Record<string, unknown>> = [
      {
        "@type": "WebPage",
        "@id": `${shareUrl}#webpage`,
        url: shareUrl,
        name: pageTitle,
        description: snippet(description),
        inLanguage: "en-ZA",
        dateModified: normalizeDate(job._updatedAt) || undefined,
        isPartOf: {
          "@type": "WebSite",
          "@id": "https://careerunified.com/#website",
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
          {"@type": "ListItem", position: 2, name: "Jobs", item: "https://careerunified.com/jobs"},
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

    const schema = {"@context": "https://schema.org", "@graph": graph};
    const analyticsContext = {
      job_id: job._id || canonicalSlug,
      job_title: jobTitle,
      job_company: companyName,
      job_source: sanityJob ? "sanity" : "recruiter",
      page_path: `/jobs/${canonicalSlug}`,
    };

    const html = `<!DOCTYPE html>
<html lang="en-ZA">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <meta name="author" content="Career Unified">
  <meta name="robots" content="${expired ? "noindex, follow" : "index, follow, max-snippet:-1, max-image-preview:large"}">
  <meta name="theme-color" content="#1e3a8a">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="en_ZA">
  <meta property="og:site_name" content="Career Unified">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(metaDescription)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(metaDescription)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <script async src="https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${ANALYTICS_ID}', {send_page_view: true});
  </script>
  <script type="application/ld+json">${jsonLd(schema)}</script>
  <style>
    ${SITE_SHELL_STYLES}
    .job-detail-page{margin:0;background:#f7f9fc;color:#111827;font-family:'Poppins',Arial,sans-serif;line-height:1.65}
    .detail-container{width:min(1120px,calc(100% - 40px));margin:0 auto}
    .detail-hero{background:#1e3a8a;color:#fff;border-top:4px solid #facc15;padding:30px 0 44px}
    .detail-breadcrumb{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 24px;padding:0;list-style:none;font-size:14px;color:#dbeafe}
    .detail-breadcrumb a{color:#fff;text-decoration:underline;text-underline-offset:3px}
    .detail-eyebrow{margin:0 0 10px;color:#fde68a;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0}
    .detail-hero h1{max-width:920px;margin:0;color:#fff;font-size:42px;line-height:1.16;overflow-wrap:anywhere}
    .hero-summary{max-width:790px;margin:16px 0 0;color:#dbeafe;font-size:18px}
    .hero-meta{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:20px;color:#dbeafe;font-size:13px}
    .status-pill{display:inline-flex;align-items:center;min-height:32px;padding:5px 11px;border-radius:6px;background:${expired ? "#fee2e2" : "#dcfce7"};color:${expired ? "#991b1b" : "#166534"};font-weight:700}
    .detail-main{padding:30px 0 64px;touch-action:pan-y}
    .detail-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:22px}
    .back-link{color:#1e3a8a;font-weight:700}
    .share-button{display:inline-flex;min-height:42px;align-items:center;justify-content:center;gap:8px;padding:8px 13px;border:1px solid #bfdbfe;border-radius:6px;background:#fff;color:#1d4ed8;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
    .share-button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .facts-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:38px}
    .fact-card{min-width:0;min-height:108px;padding:17px;background:#fff;border:1px solid #dbe3ee;border-top:4px solid #2563eb;border-radius:8px}
    .fact-card--location,.fact-card--type{border-top-color:#16a34a}
    .fact-card--salary,.fact-card--posted{border-top-color:#64748b}
    .fact-card--deadline{border-top-color:#eab308}
    .fact-card span{display:block;margin-bottom:7px;color:#64748b;font-size:13px;font-weight:700}
    .fact-card strong{display:block;color:#111827;font-size:17px;line-height:1.35;overflow-wrap:anywhere}
    .content-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(285px,.72fr);gap:44px;align-items:start}
    .description-section h2{margin:0 0 18px;color:#1e3a8a;font-size:26px;line-height:1.3}
    .description-content{color:#374151;line-height:1.78;white-space:pre-wrap;overflow-wrap:anywhere}
    .description-link{color:#2563eb;font-weight:700;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
    .application-panel{padding:22px;background:#fff;border:1px solid #dbe3ee;border-radius:8px}
    .company-row{display:flex;align-items:center;gap:13px;margin-bottom:18px}
    .company-logo{width:58px;height:58px;flex:0 0 auto;border:1px solid #dbe3ee;border-radius:8px;background:#fff;object-fit:contain}
    .company-row strong{display:block;color:#111827;overflow-wrap:anywhere}
    .company-row span{display:block;color:#64748b;font-size:13px}
    .application-panel h2{margin:0 0 9px;color:#111827;font-size:21px}
    .application-panel p{margin:0 0 16px;color:#4b5563;font-size:14px}
    .detail-actions{display:grid;gap:10px}
    .detail-button{display:inline-flex;min-height:48px;align-items:center;justify-content:center;gap:8px;padding:12px 15px;border:1px solid transparent;border-radius:6px;text-align:center;text-decoration:none;font-weight:700}
    .detail-button:hover{text-decoration:none}
    .detail-button--primary{background:#16a34a;color:#fff}
    .detail-button--primary:hover{background:#15803d;color:#fff}
    .detail-button--secondary{background:#eaf1fb;color:#1e3a8a;border-color:#cbdcf4}
    .external-icon{width:19px;height:19px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.3}
    .closed-note{padding:11px 12px;border-radius:6px;background:#fef2f2;color:#991b1b;font-weight:700}
    .adjacent-section{margin-top:46px;padding-top:30px;border-top:1px solid #dbe3ee}
    .adjacent-section h2,.related-section h2{margin:0 0 16px;color:#111827;font-size:23px}
    .adjacent-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .adjacent-links>:only-child{grid-column:1/-1}
    .adjacent-link{display:block;min-height:88px;padding:16px;background:#fff;border:1px solid #dbe3ee;border-radius:8px;text-decoration:none}
    .adjacent-link:hover{border-color:#2563eb;text-decoration:none}
    .adjacent-link span{display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0}
    .adjacent-link strong{display:block;margin-top:5px;color:#1e3a8a;overflow-wrap:anywhere}
    .swipe-hint{margin:12px 0 0;color:#64748b;font-size:13px;text-align:center}
    .related-section{margin-top:42px;padding-top:30px;border-top:1px solid #dbe3ee}
    .related-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .related-link{display:block;min-height:112px;padding:17px;background:#fff;border:1px solid #dbe3ee;border-radius:8px;color:#111827;text-decoration:none}
    .related-link:hover{border-color:#2563eb;text-decoration:none}
    .related-link strong{display:block;margin-bottom:6px;color:#1e3a8a;font-size:17px}
    .related-link span{display:block;color:#64748b;font-size:14px;font-weight:400}
    @media(max-width:800px){.detail-hero h1{font-size:34px}.facts-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.content-layout{grid-template-columns:1fr;gap:30px}.related-grid{grid-template-columns:1fr}}
    @media(max-width:560px){.detail-container{width:min(100% - 28px,1120px)}.detail-hero{padding:22px 0 32px}.detail-breadcrumb{margin-bottom:20px;font-size:13px}.detail-hero h1{font-size:29px}.hero-summary{font-size:16px}.detail-main{padding:20px 0 48px}.detail-toolbar{align-items:stretch}.share-button{min-width:100px}.facts-grid{grid-template-columns:1fr;gap:10px}.fact-card{min-height:90px;padding:15px}.description-section h2{font-size:22px}.adjacent-links{grid-template-columns:1fr}.adjacent-links>:only-child{grid-column:auto}}
  </style>
</head>
<body class="site-detail-page job-detail-page">
  ${renderSiteNavigation("jobs")}

  <header class="detail-hero">
    <div class="detail-container">
      <nav aria-label="Breadcrumb">
        <ol class="detail-breadcrumb">
          <li><a href="/">Home</a></li>
          <li aria-hidden="true">/</li>
          <li><a href="/jobs">Jobs</a></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">${escapeHtml(jobTitle)}</li>
        </ol>
      </nav>
      <p class="detail-eyebrow">Current job opportunity</p>
      <h1>${escapeHtml(jobTitle)}</h1>
      <p class="hero-summary">${escapeHtml(companyName)} in ${escapeHtml(locationText)}</p>
      <div class="hero-meta">
        <span class="status-pill">${escapeHtml(statusText)}</span>
        <span>Posted ${escapeHtml(postedLabel)}</span>
        <span>Closing date: ${escapeHtml(deadlineLabel)}</span>
      </div>
    </div>
  </header>

  <main class="detail-main" id="job-preview">
    <div class="detail-container">
      <div class="detail-toolbar">
        <a class="back-link" id="close-job" href="/jobs">Back to all jobs</a>
        <button class="share-button" id="share-job" type="button" aria-label="Share job">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 10.7 6.8-4.1"></path><path d="m8.6 13.3 6.8 4.1"></path></svg>
          <span>Share</span>
        </button>
      </div>

      <section class="facts-grid" aria-label="Job facts">
        ${factCard("Company", companyName, "company")}
        ${factCard("Location", locationText, "location")}
        ${factCard("Salary", salaryText, "salary")}
        ${factCard("Closing date", deadlineLabel, "deadline")}
        ${factCard("Date posted", postedLabel, "posted")}
        ${factCard("Employment type", job.jobType || "Full-time", "type")}
      </section>

      <div class="content-layout">
        <article class="description-section">
          <h2>About this opportunity</h2>
          <div class="description-content">${formatDescriptionHtml(job.description)}</div>
        </article>

        <aside class="application-panel" aria-labelledby="application-heading">
          <div class="company-row">
            <img class="company-logo" src="${escapeHtml(image)}" alt="${escapeHtml(companyName)} logo" width="58" height="58">
            <div><strong>${escapeHtml(companyName)}</strong><span>${escapeHtml(locationText)}</span></div>
          </div>
          <h2 id="application-heading">Prepare your application</h2>
          <p>Review the requirements carefully and apply through the listed application page.</p>
          <div class="detail-actions">
            ${!expired && applyUrl ? `<a class="detail-button detail-button--primary" id="apply-job-link" href="${escapeHtml(applyUrl)}" target="_blank" rel="noopener noreferrer">Apply Now <svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4 10 14"></path><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"></path></svg></a>` : ""}
            ${expired ? '<div class="closed-note">Applications are closed for this listing.</div>' : ""}
            <a class="detail-button detail-button--secondary" id="ai-tailor-link" href="/cv-generator/?tab=ai&amp;source=job">AI Tailor CV</a>
          </div>
        </aside>
      </div>

      ${(previousUrl || nextUrl) ? `<section class="adjacent-section" aria-labelledby="more-jobs-heading">
        <h2 id="more-jobs-heading">More job opportunities</h2>
        <nav class="adjacent-links" aria-label="Previous and next jobs">
          ${previousUrl ? `<a class="adjacent-link" href="${escapeHtml(previousUrl)}"><span>Previous job</span><strong>${escapeHtml(previousJob?.title || "View opportunity")}</strong></a>` : ""}
          ${nextUrl ? `<a class="adjacent-link" href="${escapeHtml(nextUrl)}"><span>Next job</span><strong>${escapeHtml(nextJob?.title || "View opportunity")}</strong></a>` : ""}
        </nav>
        <p class="swipe-hint">On mobile, swipe right or left to view another job.</p>
      </section>` : ""}

      <section class="related-section" aria-labelledby="related-heading">
        <h2 id="related-heading">Continue your job search</h2>
        <div class="related-grid">
          <a class="related-link" href="/jobs"><strong>Browse all jobs</strong><span>View the latest opportunities and closing dates.</span></a>
          <a class="related-link" href="/cv-generator/"><strong>Build your CV</strong><span>Create a professional CV for your next application.</span></a>
          <a class="related-link" href="/cv-tips"><strong>Read CV tips</strong><span>Use practical guidance for company and government applications.</span></a>
        </div>
      </section>
    </div>
  </main>

  ${renderSiteFooter()}
  ${renderSiteNavigationScript()}
  <script>
    (() => {
      const preview = document.getElementById('job-preview');
      const previousUrl = ${jsonLd(previousUrl || null)};
      const nextUrl = ${jsonLd(nextUrl || null)};
      const aiTailorPayload = ${jsonLd(aiTailorPayload)};
      const shareUrl = ${jsonLd(shareUrl)};
      const analyticsContext = ${jsonLd(analyticsContext)};
      let startX = 0;
      let startY = 0;

      gtag('event', 'job_detail_view', analyticsContext);

      document.getElementById('close-job')?.addEventListener('click', (event) => {
        const referrer = document.referrer ? new URL(document.referrer) : null;
        if (referrer?.origin === window.location.origin && history.length > 1) {
          event.preventDefault();
          history.back();
        }
      });

      document.getElementById('apply-job-link')?.addEventListener('click', (event) => {
        gtag('event', 'job_apply_click', {
          ...analyticsContext,
          link_url: event.currentTarget.href,
          transport_type: 'beacon'
        });
      });

      document.getElementById('share-job')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const label = button.querySelector('span');
        gtag('event', 'job_share', {...analyticsContext, transport_type: 'beacon'});
        try {
          if (navigator.share) {
            await navigator.share({title: ${jsonLd(jobTitle)}, url: shareUrl});
          } else {
            await navigator.clipboard.writeText(shareUrl);
            if (label) label.textContent = 'Copied';
          }
        } catch (error) {
          if (error?.name !== 'AbortError') {
            try {
              await navigator.clipboard.writeText(shareUrl);
              if (label) label.textContent = 'Copied';
            } catch {}
          }
        }
        if (label?.textContent === 'Copied') {
          window.setTimeout(() => label.textContent = 'Share', 1800);
        }
      });

      document.getElementById('ai-tailor-link')?.addEventListener('click', () => {
        sessionStorage.setItem('careerUnifiedAITailorJob', JSON.stringify(aiTailorPayload));
        const eventData = {
          ...analyticsContext,
          event_category: 'conversion_funnel',
          funnel_step: 'job_to_ai_tailor',
          placement: 'job_search_landing',
          button_text: 'AI Tailor CV',
          transport_type: 'beacon'
        };
        gtag('event', 'ai_tailor_start', eventData);
        gtag('event', 'ai_cv_tailor_click', eventData);
      });

      preview?.addEventListener('touchstart', (event) => {
        startX = event.changedTouches[0].screenX;
        startY = event.changedTouches[0].screenY;
      }, {passive: true});

      preview?.addEventListener('touchend', (event) => {
        const deltaX = event.changedTouches[0].screenX - startX;
        const deltaY = event.changedTouches[0].screenY - startY;
        if (Math.abs(deltaX) <= 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 2) return;
        const destination = deltaX < 0 ? nextUrl : previousUrl;
        if (destination) window.location.href = destination;
      }, {passive: true});
    })();
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, must-revalidate",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("job edge error:", error);
    return new Response("Unable to load job", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
};
