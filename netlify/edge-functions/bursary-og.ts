import {getActiveBursaries, getBursaryBySlug} from "../lib/sanity.ts";
import {
  renderSiteFooter,
  renderSiteNavigation,
  renderSiteNavigationScript,
  SITE_SHELL_STYLES,
} from "../lib/siteShell.ts";

const ANALYTICS_ID = "G-2Z934XRVXT";

type BursarySummary = {
  slug?: string;
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

function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function ensureHttps(value: unknown) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

function detailRow(label: string, value: unknown) {
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not specified")}</strong></div>`;
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

export default async (request: Request) => {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? parts[1] : null;

    if (!slug || slug === "bursary") {
      return Response.redirect("https://careerunified.com/bursaries", 301);
    }

    const [bursary, activeBursaries] = await Promise.all([
      getBursaryBySlug(slug).catch((error) => {
        console.error("bursary lookup error:", error);
        return null;
      }),
      getActiveBursaries().catch((error) => {
        console.error("adjacent bursaries fetch error:", error);
        return [];
      }),
    ]);
    if (!bursary) {
      return new Response("Bursary not found", {
        status: 404,
        headers: {"content-type": "text/plain; charset=utf-8"},
      });
    }

    const bursaryName = bursary.name || "Bursary Opportunity";
    const providerName = bursary.provider || "Provider";
    const shareUrl = `https://careerunified.com/bursary/${slug}`;
    const image = ensureHttps(bursary.providerLogoUrl) || "https://careerunified.com/android-chrome-512x512.png";
    const faculties = Array.isArray(bursary.faculties) && bursary.faculties.length
      ? bursary.faculties
      : bursary.faculty
        ? [bursary.faculty]
        : [];
    const facultyText = faculties.length ? faculties.join(", ") : "All fields";
    const deadlineDate = normalizeDate(bursary.deadline);
    const modifiedDate = normalizeDate(bursary._updatedAt);
    const expired = Boolean(deadlineDate && deadlineDate < new Date().toISOString().slice(0, 10));
    const description = stripHtml(bursary.description);
    const metaDescription = `${providerName} - ${facultyText} - Deadline: ${deadlineDate || bursary.deadline || "Not specified"} - ${snippet(description)}`.trim();
    const pageTitle = `${bursaryName} | Career Unified`;
    const currentIndex = activeBursaries.findIndex(
      (item: BursarySummary) => item.slug === slug,
    );
    const previousBursary = currentIndex > 0
      ? activeBursaries[currentIndex - 1]
      : null;
    const nextBursary = currentIndex >= 0 &&
        currentIndex < activeBursaries.length - 1
      ? activeBursaries[currentIndex + 1]
      : null;
    const previousUrl = previousBursary?.slug
      ? `/bursary/${encodeURIComponent(previousBursary.slug)}`
      : "";
    const nextUrl = nextBursary?.slug
      ? `/bursary/${encodeURIComponent(nextBursary.slug)}`
      : "";

    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${shareUrl}#webpage`,
          url: shareUrl,
          name: pageTitle,
          description: snippet(description),
          inLanguage: "en-ZA",
          dateModified: modifiedDate || undefined,
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
            {"@type": "ListItem", position: 2, name: "Bursaries", item: "https://careerunified.com/bursaries"},
            {"@type": "ListItem", position: 3, name: bursaryName, item: shareUrl},
          ],
        },
        {
          "@type": "Article",
          headline: bursaryName,
          description: description || snippet(description),
          dateModified: modifiedDate || undefined,
          mainEntityOfPage: shareUrl,
          image,
          author: {
            "@type": "Organization",
            name: "Career Unified",
            url: "https://careerunified.com/",
          },
          publisher: {
            "@type": "Organization",
            name: "Career Unified",
            logo: {
              "@type": "ImageObject",
              url: "https://careerunified.com/android-chrome-512x512.png",
            },
          },
        },
      ],
    };
    const analyticsContext = {
      bursary_id: bursary._id || slug,
      bursary_name: bursaryName,
      bursary_provider: providerName,
      bursary_deadline: deadlineDate || "not_listed",
      page_path: `/bursary/${slug}`,
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
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Career Unified">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(metaDescription)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:secure_url" content="${escapeHtml(image)}">
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
    body{position:relative;margin:0;font-family:"Poppins",Arial,sans-serif;background:#f7f9fc;color:#111827;line-height:1.65}
    header{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:44px 20px}
    main,.inner{max-width:960px;margin:0 auto}
    main{display:flex;flex-direction:column;padding:28px 20px 54px}
    a{color:#1d4ed8}
    .brand a{color:#fff;text-decoration:none;font-weight:700}
    h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.1;margin:20px 0 12px}
    .meta{font-size:1.05rem;color:#dbeafe}
    .panel{background:#fff;border:1px solid #dbeafe;border-radius:18px;box-shadow:0 16px 38px rgba(30,58,138,.12);padding:22px;margin:20px 0}
    .summary-panel{order:1}
    .description{order:2}
    .actions-panel{order:3}
    .mobile-preview-header{display:none}
    .provider-row{display:flex;align-items:center;gap:12px;margin-bottom:16px}
    .provider-logo{width:48px;height:48px;border-radius:10px;object-fit:contain;border:1px solid #dbeafe;background:#fff}
    .provider-name{color:#1f2937;font-weight:700}
    .details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .detail-row{border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fbfdff}
    .detail-row span{display:block;color:#64748b;font-size:.86rem;font-weight:700}
    .detail-row strong{display:block;color:#111827}
    .description-content{color:#374151;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
    .description-link{color:#2563eb;font-weight:700;text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:2px}
    .description-link:hover,.description-link:focus-visible{color:#1d4ed8}
    .actions{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:8px;padding:16px;font-weight:700;text-decoration:none;text-align:center}
    .btn.green{background:#16a34a;color:#fff}
    .btn.green:hover{background:#15803d}
    .external-icon{width:19px;height:19px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.3}
    .swipe-hint{display:none}
    @media(max-width:680px){
      body{background:#f4f7fc}
      header{display:none}
      main{
        width:calc(100% - 36px);
        margin:18px auto;
        padding:22px;
        background:#fff;
        border:1px solid #dbeafe;
        border-radius:18px;
        box-shadow:0 16px 38px rgba(30,58,138,.12);
        touch-action:pan-y
      }
      .panel{background:transparent;border:0;border-radius:0;box-shadow:none;padding:0;margin:0}
      .mobile-preview-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:12px;width:100%;margin-bottom:16px}
      .mobile-preview-header h1{flex:1;min-width:0;color:#1e3a8a;font-size:1.4rem;line-height:1.3;margin:0;overflow-wrap:anywhere}
      .preview-actions{display:flex;align-items:center;gap:6px}
      .share-btn{border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1d4ed8;padding:8px 10px;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}
      .close-preview{display:inline-flex;align-items:center;justify-content:center;width:28px;height:32px;color:#3b82f6;text-decoration:none}
      .close-preview svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-width:2.5}
      .provider-row{margin-bottom:14px}
      .details{grid-template-columns:1fr}
      .detail-row{border-color:#dbeafe;border-radius:14px;padding:16px;background:#f8fbff}
      .detail-row span{text-transform:uppercase;letter-spacing:.04em}
      .description{margin-top:20px;padding:18px;background:#f9fafb;border:1px solid #e5edfb;border-radius:10px}
      .description-content{font-size:1rem;line-height:1.75}
      .actions-panel{margin-top:18px}
      .btn{width:100%}
      .swipe-hint{display:block;margin:14px 0 0;color:#64748b;font-size:.75rem;text-align:center}
    }
    @media(max-width:390px){
      main{width:calc(100% - 20px);margin:10px auto;padding:16px}
      .mobile-preview-header h1{font-size:1.25rem}
    }
  </style>
</head>
<body class="site-detail-page">
  ${renderSiteNavigation("bursaries")}
  <header>
    <div class="inner">
      <div class="brand"><a href="https://careerunified.com/">Career Unified</a></div>
      <h1>${escapeHtml(bursaryName)}</h1>
      <div class="meta">${escapeHtml(providerName)} - ${escapeHtml(facultyText)}</div>
      ${expired ? '<div class="meta"><strong>Applications closed</strong></div>' : ""}
    </div>
  </header>
  <main id="bursary-preview">
    <section class="panel summary-panel">
      <div class="mobile-preview-header">
        <h1>${escapeHtml(bursaryName)}</h1>
        <div class="preview-actions">
          <a class="close-preview" href="https://careerunified.com/bursaries" aria-label="Close bursary details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></a>
          <button class="share-btn" id="share-bursary" type="button">Share</button>
        </div>
      </div>
      <div class="provider-row">
        <img class="provider-logo" src="${escapeHtml(image)}" alt="${escapeHtml(providerName)} logo" width="48" height="48">
        <div class="provider-name">${escapeHtml(providerName)}</div>
      </div>
      <div class="details">
        ${detailRow("Faculty / field", facultyText)}
        ${detailRow("Closing date", deadlineDate || bursary.deadline || "Not specified")}
      </div>
    </section>
    <section class="panel description">
      <div class="description-content">${formatDescriptionHtml(bursary.description)}</div>
    </section>
    <section class="panel actions-panel">
      <div class="actions">
        ${!expired && bursary.applicationLink ? `<a class="btn green" id="apply-bursary-link" href="${escapeHtml(ensureHttps(bursary.applicationLink))}" target="_blank" rel="noopener noreferrer">Apply Now <svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4 10 14"></path><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"></path></svg></a>` : ""}
      </div>
      ${(previousUrl || nextUrl) ? '<p class="swipe-hint">Swipe right or left to view another bursary</p>' : ""}
    </section>
  </main>
  ${renderSiteFooter()}
  ${renderSiteNavigationScript()}
  <script>
    (() => {
      const preview = document.getElementById("bursary-preview");
      const previousUrl = ${jsonLd(previousUrl || null)};
      const nextUrl = ${jsonLd(nextUrl || null)};
      const shareUrl = ${jsonLd(shareUrl)};
      const analyticsContext = ${jsonLd(analyticsContext)};
      let startX = 0;
      let startY = 0;

      gtag('event', 'bursary_detail_view', analyticsContext);

      document.getElementById('apply-bursary-link')?.addEventListener('click', (event) => {
        gtag('event', 'bursary_apply_click', {
          ...analyticsContext,
          link_url: event.currentTarget.href,
          transport_type: 'beacon'
        });
      });

      document.getElementById("share-bursary")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        gtag('event', 'bursary_share', {...analyticsContext, transport_type: 'beacon'});
        try {
          if (navigator.share) {
            await navigator.share({title: ${jsonLd(bursaryName)}, url: shareUrl});
          } else {
            await navigator.clipboard.writeText(shareUrl);
            button.textContent = "Copied";
          }
        } catch (error) {
          if (error?.name !== "AbortError") {
            try {
              await navigator.clipboard.writeText(shareUrl);
              button.textContent = "Copied";
            } catch {}
          }
        }
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
  <script src="/js/cookie-notice.js"></script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("bursary edge error:", err);
    return new Response("Edge function error", {status: 500});
  }
};
