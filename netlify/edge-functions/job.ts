import {getActiveJobs, getJobBySlug} from "../lib/sanity.ts";
import {getRecruiterJobs, isActiveRecruiterJob} from "../lib/firestore.ts";
import {
  renderSiteFooter,
  renderSiteNavigation,
  renderSiteNavigationScript,
  SITE_SHELL_STYLES,
} from "../lib/siteShell.ts";

const ANALYTICS_ID = "G-2Z934XRVXT";

type EdgeContext = {
  next: () => Promise<Response>;
};

type JobSummary = {
  slug?: string;
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
  return cleaned.slice(0, maxLen - 3).trim() + "...";
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().slice(0, 10);
}

function closingDateLabel(job: Record<string, unknown>, normalizedDate = "") {
  return String(job.deadlineText || normalizedDate || job.deadline || "Not specified").trim();
}

function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function isPreviewBot(userAgent: string) {
  return /bot|crawler|spider|crawling|google|bing|yandex|duckduck|baidu|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot/i.test(userAgent);
}

function isMobileUserAgent(userAgent: string) {
  return /android|iphone|ipad|ipod|mobile|opera mini|iemobile/i.test(userAgent);
}

function detailRow(label: string, value: unknown, className = "") {
  const classes = ["detail-row", className].filter(Boolean).join(" ");
  return `<div class="${classes}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not specified")}</strong></div>`;
}

function formatDescription(value: unknown) {
  const cleaned = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/[ \t]+•[ \t]+/g, "\n• ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return escapeHtml(cleaned || "Description not provided.");
}

function renderDescriptionLink(url: string, label: string) {
  const cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) return escapeHtml(label || url);

  let isInternal = false;
  try {
    isInternal = new URL(cleanUrl).origin === "https://careerunified.com";
  } catch {
    isInternal = false;
  }

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
    const linkLabel = markdownUrl ? String(label).trim() : reversedUrl ? String(reversedLabel).trim() : cleanUrl;

    output += cleaned.slice(lastIndex, offset);
    output += renderDescriptionLink(cleanUrl, linkLabel);
    output += escapeHtml(punctuation);
    lastIndex = offset + match.length;
    return match;
  });

  output += cleaned.slice(lastIndex);
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

export default async (request: Request, context: EdgeContext) => {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? parts[1] : null;

    if (!slug || slug === "jobs") {
      return Response.redirect("https://careerunified.com/jobs", 301);
    }

    const userAgent = request.headers.get("user-agent") || "";
    if (!isPreviewBot(userAgent) && !isMobileUserAgent(userAgent)) {
      return context.next();
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
        headers: {"content-type": "text/plain; charset=utf-8"},
      });
    }
    const activeJobs = [
      ...sanityJobs,
      ...recruiterJobs.filter(isActiveRecruiterJob),
    ].sort((a: JobSummary, b: JobSummary) =>
      new Date(b.posted || 0).getTime() - new Date(a.posted || 0).getTime()
    );

    const companyName = job.companyName || "Confidential";
    const jobTitle = job.title || "Job Opportunity";
    const canonicalSlug = job.slug || slug;
    if (canonicalSlug !== slug) {
      return Response.redirect(`https://careerunified.com/jobs/${encodeURIComponent(canonicalSlug)}`, 301);
    }
    const shareUrl = `https://careerunified.com/jobs/${canonicalSlug}`;
    const image = job.companyLogo || "https://careerunified.com/android-chrome-512x512.png";
    const salaryText = job.salary || "Not specified";
    const locationText = job.location || "South Africa";
    const postedDate = normalizeDate(job.posted);
    const deadlineDate = normalizeDate(job.deadline);
    const deadlineLabel = closingDateLabel(job, deadlineDate);
    const expired = Boolean(deadlineDate && deadlineDate < new Date().toISOString().slice(0, 10));
    const description = stripHtml(job.description);
    const metaDescription = `${companyName} - ${locationText} - Salary: ${salaryText} - ${snippet(description)}`.trim();
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

    const schema = {
      "@context": "https://schema.org",
      "@graph": graph,
    };
    const analyticsContext = {
      job_id: job._id || canonicalSlug,
      job_title: jobTitle,
      job_company: companyName,
      job_source: sanityJob ? "sanity" : "recruiter",
      page_path: `/jobs/${canonicalSlug}`,
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
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
    *{box-sizing:border-box}
    body{margin:0;font-family:"Poppins",Arial,sans-serif;background:#f7f9fc;color:#111827;line-height:1.65}
    header{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:44px 20px}
    main,.inner{max-width:960px;margin:0 auto}
    main{display:flex;flex-direction:column;padding:28px 20px 54px}
    a{color:#1d4ed8}
    .brand a{color:#fff;text-decoration:none;font-weight:700}
    h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.1;margin:20px 0 12px}
    .meta{font-size:1.05rem;color:#dbeafe}
    .panel{background:#fff;border:1px solid #dbeafe;border-radius:18px;box-shadow:0 16px 38px rgba(30,58,138,.12);padding:22px;margin:20px 0}
    .summary-panel{order:1}
    .actions-panel{order:2}
    .description{order:3}
    .mobile-preview-header{display:none}
    .preview-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}
    .share-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1d4ed8;padding:8px 10px;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}
    .share-btn svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .detail-row{border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fbfdff}
    .detail-row span{display:block;color:#64748b;font-size:.86rem;font-weight:700}
    .detail-row strong{display:block;color:#111827}
    .description-content{color:#374151;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
    .description-link{color:#2563eb;font-weight:700;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
    .description-link:hover,.description-link:focus-visible{color:#1d4ed8}
    .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .actions>:only-child{grid-column:1/-1}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:8px;padding:16px;font-weight:700;text-decoration:none;text-align:center}
    .btn.green{background:#16a34a;color:#fff}
    .btn.green:hover{background:#15803d}
    .external-icon{width:19px;height:19px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.3}
    .swipe-hint{display:none}
    @media(max-width:680px){
      body{background:#f4f7fc}
      header{display:none}
      main{
        display:flex;
        margin:18px;
        padding:22px;
        background:#fff;
        border:1px solid #dbeafe;
        border-radius:18px;
        box-shadow:0 16px 38px rgba(30,58,138,.12);
        touch-action:pan-y
      }
      .summary-panel{order:1}
      .description{order:2}
      .actions-panel{order:3}
      .panel{background:transparent;border:0;border-radius:0;box-shadow:none;padding:0;margin:0}
      .mobile-preview-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}
      .mobile-preview-header h1{flex:1;min-width:0;color:#1e3a8a;font-size:1.4rem;line-height:1.3;margin:0;overflow-wrap:anywhere}
      .close-preview{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:28px;height:32px;color:#3b82f6;text-decoration:none}
      .close-preview svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-width:2.5}
      .details{grid-template-columns:1fr}
      .secondary-detail{display:none}
      .detail-row{border-color:#dbeafe;border-radius:14px;padding:16px;background:#f8fbff}
      .detail-row span{text-transform:uppercase;letter-spacing:.04em}
      .description{margin-top:20px;padding:18px;background:#f9fafb;border:1px solid #e5edfb;border-radius:10px}
      .description-content{font-size:1rem;line-height:1.75}
      .actions-panel{margin-top:18px}
      .btn{box-sizing:border-box;width:100%}
      .swipe-hint{display:block;margin:14px 0 0;color:#64748b;font-size:.75rem;text-align:center}
    }
    @media(max-width:390px){
      main{margin:10px;padding:16px}
      .actions{gap:10px}
      .btn{padding:14px 8px;font-size:.9rem}
    }
  </style>
</head>
<body class="site-detail-page">
  ${renderSiteNavigation("jobs")}
  <header>
    <div class="inner">
      <div class="brand"><a href="https://careerunified.com/">Career Unified</a></div>
      <h1>${escapeHtml(jobTitle)}</h1>
      <div class="meta">${escapeHtml(companyName)} - ${escapeHtml(locationText)}</div>
      ${expired ? '<div class="meta"><strong>Applications closed</strong></div>' : ""}
    </div>
  </header>
  <main id="job-preview">
    <section class="panel summary-panel">
      <div class="mobile-preview-header">
        <h1>${escapeHtml(jobTitle)}</h1>
        <div class="preview-actions">
          <button class="share-btn" id="share-job" type="button" aria-label="Share job">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 10.7 6.8-4.1"></path><path d="m8.6 13.3 6.8 4.1"></path></svg>
            <span>Share</span>
          </button>
          <a class="close-preview" id="close-job" href="https://careerunified.com/jobs" aria-label="Close job details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></a>
        </div>
      </div>
      <div class="details">
        ${detailRow("Company", companyName)}
        ${detailRow("Location", locationText)}
        ${detailRow("Salary", salaryText)}
        ${detailRow("Closing date", deadlineLabel)}
        ${detailRow("Date posted", postedDate || job.posted || "Not specified", "secondary-detail")}
        ${detailRow("Employment type", job.jobType || "Full-time", "secondary-detail")}
      </div>
    </section>
    <section class="panel description">
      <div class="description-content">${formatDescriptionHtml(job.description)}</div>
    </section>
    <section class="panel actions-panel">
      <div class="actions">
        ${!expired && job.applyLink ? `<a class="btn green" id="apply-job-link" href="${escapeHtml(job.applyLink)}" target="_blank" rel="noopener noreferrer">Apply Now <svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4 10 14"></path><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"></path></svg></a>` : ""}
        <a class="btn green" id="ai-tailor-link" href="https://careerunified.com/cv-generator/?tab=ai&source=job">AI Tailor CV</a>
      </div>
      ${(previousUrl || nextUrl) ? '<p class="swipe-hint">Swipe right or left to view another job</p>' : ""}
    </section>
  </main>
  ${renderSiteFooter()}
  ${renderSiteNavigationScript()}
  <script>
    (() => {
      const preview = document.getElementById("job-preview");
      const previousUrl = ${jsonLd(previousUrl || null)};
      const nextUrl = ${jsonLd(nextUrl || null)};
      const aiTailorPayload = ${jsonLd(aiTailorPayload)};
      const shareUrl = ${jsonLd(shareUrl)};
      const analyticsContext = ${jsonLd(analyticsContext)};
      let startX = 0;
      let startY = 0;

      gtag('event', 'job_detail_view', analyticsContext);

      document.getElementById('apply-job-link')?.addEventListener('click', (event) => {
        gtag('event', 'job_apply_click', {
          ...analyticsContext,
          link_url: event.currentTarget.href,
          transport_type: 'beacon'
        });
      });

      document.getElementById("close-job")?.addEventListener("click", (event) => {
        const referrer = document.referrer ? new URL(document.referrer) : null;
        if (referrer?.origin === window.location.origin && history.length > 1) {
          event.preventDefault();
          history.back();
        }
      });

      document.getElementById("share-job")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const label = button.querySelector("span");
        gtag('event', 'job_share', {...analyticsContext, transport_type: 'beacon'});
        try {
          if (navigator.share) {
            await navigator.share({title: ${jsonLd(jobTitle)}, url: shareUrl});
          } else {
            await navigator.clipboard.writeText(shareUrl);
            if (label) label.textContent = "Copied";
          }
        } catch (error) {
          if (error?.name !== "AbortError") {
            try {
              await navigator.clipboard.writeText(shareUrl);
              if (label) label.textContent = "Copied";
            } catch {}
          }
        }
        if (label?.textContent === "Copied") {
          window.setTimeout(() => label.textContent = "Share", 1800);
        }
      });

      document.getElementById("ai-tailor-link")?.addEventListener("click", () => {
        sessionStorage.setItem("careerUnifiedAITailorJob", JSON.stringify(aiTailorPayload));
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

      preview?.addEventListener("touchstart", (event) => {
        startX = event.changedTouches[0].screenX;
        startY = event.changedTouches[0].screenY;
      }, {passive: true});

      preview?.addEventListener("touchend", (event) => {
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
      },
    });
  } catch (err) {
    console.error("job edge error:", err);
    return new Response("Edge function error", {status: 500});
  }
};
