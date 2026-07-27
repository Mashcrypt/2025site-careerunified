import {getUniversityBySlug} from "../lib/sanity.ts";

const SITE_ORIGIN = "https://careerunified.com";
const ANALYTICS_ID = "G-2Z934XRVXT";

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

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function safeHttpUrl(value: unknown) {
  const raw = textValue(value);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function dateDetails(value: unknown) {
  const raw = textValue(value);
  if (!raw) return {iso: "", display: ""};

  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  const iso = isoMatch?.[1] || "";
  const date = new Date(iso ? `${iso}T12:00:00Z` : raw);

  if (Number.isNaN(date.getTime())) {
    return {iso, display: raw};
  }

  return {
    iso: iso || date.toISOString().slice(0, 10),
    display: new Intl.DateTimeFormat("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Africa/Johannesburg",
    }).format(date),
  };
}

function shortenDescription(value: string, maxLength = 170) {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 110 ? lastSpace : maxLength - 1).trim()}...`;
}

function noteParagraphs(value: unknown) {
  const notes = textValue(value);
  if (!notes) return "";

  return notes
    .split(/\n\s*\n|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function factCard(label: string, value: unknown, modifier: string) {
  return `<div class="fact-card fact-card--${modifier}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value || "Not specified")}</strong>
  </div>`;
}

export default async (request: Request) => {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? decodeURIComponent(parts[1]) : "";

    if (!slug || slug === "varsity") {
      return Response.redirect(`${SITE_ORIGIN}/varsity`, 301);
    }

    const university = await getUniversityBySlug(slug);
    if (!university) {
      return new Response("University not found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=60",
        },
      });
    }

    const name = textValue(university.name) || "University";
    const applicationFee = textValue(university.applicationFee);
    const registrationFee = textValue(university.registrationFee);
    const deadline = dateDetails(university.deadline);
    const lastReviewed = dateDetails(university._updatedAt);
    const officialUrl = safeHttpUrl(university.applicationLink);
    const today = new Date().toISOString().slice(0, 10);
    const closed = Boolean(deadline.iso && deadline.iso < today);
    const status = deadline.iso
      ? closed
        ? "Closed for the listed intake"
        : "Open or upcoming"
      : "Deadline TBA";
    const shareUrl = `${SITE_ORIGIN}/varsity/${encodeURIComponent(slug)}`;
    const pageTitle = `${name} Application Fee & Closing Date | Career Unified`;
    const feeSentence = applicationFee
      ? `${name} application fee is ${applicationFee}.`
      : `Check the latest ${name} application fee.`;
    const deadlineSentence = deadline.display
      ? `The listed closing date is ${deadline.display}.`
      : "Check the latest application closing date.";
    const description = shortenDescription(
      `${feeSentence} ${deadlineSentence} See registration costs and the official application link.`,
    );
    const notesHtml = noteParagraphs(university.notes);
    const reviewedText = lastReviewed.display
      ? `Information last reviewed ${lastReviewed.display}`
      : "Application details are checked against the listed official source";
    const applicationFeeAnswer = applicationFee
      ? `The application fee currently listed for ${name} is ${applicationFee}. Confirm the amount and payment instructions on the official university website before paying.`
      : `An application fee is not currently listed for ${name}. Check the official application page for the latest amount and payment instructions.`;
    const registrationFeeAnswer = registrationFee
      ? `The registration fee currently listed for ${name} is ${registrationFee}. Registration costs may depend on the programme or intake, so confirm the final amount with the university.`
      : `A registration fee is not currently listed for ${name}. Confirm the latest registration costs directly with the university.`;
    const deadlineAnswer = deadline.display
      ? `The application closing date currently listed for ${name} is ${deadline.display}. Late applications are not guaranteed, so submit and save your reference before the deadline.`
      : `A confirmed application closing date is not currently listed for ${name}. Check the official application page before preparing your submission.`;

    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${shareUrl}#webpage`,
          url: shareUrl,
          name: pageTitle,
          description,
          inLanguage: "en-ZA",
          dateModified: lastReviewed.iso || undefined,
          mainEntity: {"@id": `${shareUrl}#university`},
          breadcrumb: {"@id": `${shareUrl}#breadcrumb`},
          isPartOf: {
            "@type": "WebSite",
            "@id": `${SITE_ORIGIN}/#website`,
            name: "Career Unified",
            url: `${SITE_ORIGIN}/`,
          },
        },
        {
          "@type": "CollegeOrUniversity",
          "@id": `${shareUrl}#university`,
          name,
          url: shareUrl,
          sameAs: officialUrl || undefined,
          address:
            university.city || university.province
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
          "@id": `${shareUrl}#breadcrumb`,
          itemListElement: [
            {"@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/`},
            {"@type": "ListItem", position: 2, name: "Varsities", item: `${SITE_ORIGIN}/varsity`},
            {"@type": "ListItem", position: 3, name, item: shareUrl},
          ],
        },
      ],
    };

    const analyticsContext = {
      university_slug: slug,
      university_name: name,
      application_fee: applicationFee || "not_listed",
      application_deadline: deadline.iso || "not_listed",
      page_path: `/varsity/${slug}`,
    };

    const html = `<!DOCTYPE html>
<html lang="en-ZA">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="Career Unified">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
  <meta name="theme-color" content="#1e3a8a">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="en_ZA">
  <meta property="og:site_name" content="Career Unified">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${SITE_ORIGIN}/android-chrome-512x512.png">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${SITE_ORIGIN}/android-chrome-512x512.png">
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
    .university-detail-page{margin:0;background:#f7f9fc;color:#111827;font-family:'Poppins',Arial,sans-serif;line-height:1.65}
    .university-detail-page .main-nav{z-index:100;position:relative}
    .university-detail-page .nav-links{gap:16px}
    .university-detail-page .nav-links a[aria-current="page"]{color:#facc15}
    .university-detail-page .mobile-logo{letter-spacing:0}
    .detail-container{width:min(1120px,calc(100% - 40px));margin:0 auto}
    .detail-hero{background:#1e3a8a;color:#fff;padding:34px 0 46px}
    .detail-breadcrumb{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 28px;padding:0;list-style:none;font-size:14px;color:#dbeafe}
    .detail-breadcrumb a{color:#fff;text-decoration:underline;text-underline-offset:3px}
    .detail-eyebrow{margin:0 0 10px;color:#fde68a;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0}
    .detail-hero h1{max-width:900px;margin:0;font-size:42px;line-height:1.15;color:#fff}
    .hero-summary{max-width:790px;margin:18px 0 0;color:#dbeafe;font-size:18px}
    .hero-meta{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:22px;color:#dbeafe;font-size:13px}
    .status-pill{display:inline-flex;align-items:center;min-height:32px;padding:5px 11px;border-radius:6px;background:${closed ? "#fee2e2" : "#dcfce7"};color:${closed ? "#991b1b" : "#166534"};font-weight:700}
    .detail-main{padding:36px 0 64px}
    .quick-answer{margin:0 0 26px;padding:22px 24px;background:#fff;border:1px solid #dbe3ee;border-left:5px solid #2563eb;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
    .quick-answer h2{margin:0 0 8px;color:#111827;font-size:24px;line-height:1.3}
    .quick-answer p{margin:0;color:#374151}
    .facts-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:36px}
    .fact-card{min-width:0;min-height:116px;padding:18px;background:#fff;border:1px solid #dbe3ee;border-top:4px solid #2563eb;border-radius:8px}
    .fact-card span{display:block;margin-bottom:7px;color:#64748b;font-size:13px;font-weight:700}
    .fact-card strong{display:block;overflow-wrap:anywhere;color:#111827;font-size:18px;line-height:1.35}
    .content-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(270px,.75fr);gap:44px;align-items:start}
    .content-section{padding:0 0 30px;margin:0 0 30px;border-bottom:1px solid #dbe3ee}
    .content-section:last-child{margin-bottom:0;border-bottom:0}
    .content-section h2{margin:0 0 12px;color:#1e3a8a;font-size:25px;line-height:1.3}
    .content-section p{margin:0 0 14px;color:#374151}
    .content-section p:last-child{margin-bottom:0}
    .application-steps{display:grid;gap:14px;margin:20px 0 0;padding:0;list-style:none;counter-reset:application-step}
    .application-steps li{position:relative;min-height:40px;padding-left:52px;color:#374151;counter-increment:application-step}
    .application-steps li::before{content:counter(application-step);position:absolute;left:0;top:0;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#eaf1fb;color:#1e3a8a;font-weight:700}
    .detail-actions{display:grid;gap:10px;margin-top:24px}
    .detail-button{display:inline-flex;min-height:48px;align-items:center;justify-content:center;padding:12px 16px;border:1px solid transparent;border-radius:6px;text-align:center;text-decoration:none;font-weight:700}
    .detail-button:hover{text-decoration:none}
    .detail-button--primary{background:#16a34a;color:#fff}
    .detail-button--primary:hover{background:#15803d;color:#fff}
    .detail-button--secondary{background:#eaf1fb;color:#1e3a8a;border-color:#cbdcf4}
    .source-panel{padding:22px;background:#fff;border:1px solid #dbe3ee;border-radius:8px}
    .source-panel h2{margin:0 0 12px;color:#111827;font-size:20px}
    .source-panel p{margin:0 0 13px;color:#4b5563;font-size:14px}
    .source-panel p:last-child{margin-bottom:0}
    .source-panel a{overflow-wrap:anywhere}
    .related-section{margin-top:48px;padding-top:34px;border-top:1px solid #dbe3ee}
    .related-section h2{margin:0 0 18px;color:#111827;font-size:25px}
    .related-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .related-link{display:block;min-height:118px;padding:18px;background:#fff;border:1px solid #dbe3ee;border-radius:8px;color:#111827;text-decoration:none}
    .related-link:hover{border-color:#2563eb;text-decoration:none}
    .related-link strong{display:block;margin-bottom:6px;color:#1e3a8a;font-size:17px}
    .related-link span{display:block;color:#64748b;font-size:14px;font-weight:400}
    .detail-footer{margin-top:0;padding:42px 20px 28px;background:#1e3a8a;color:#fff}
    .detail-footer-inner{display:grid;grid-template-columns:1.1fr 2fr;gap:40px;width:min(1120px,100%);margin:0 auto}
    .detail-footer-brand{max-width:360px}
    .detail-footer-brand strong{display:block;margin-bottom:10px;font-size:21px}
    .detail-footer-brand p{margin:0;color:rgba(255,255,255,.78);font-size:14px}
    .detail-footer-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
    .detail-footer-links h2{margin:0 0 10px;color:#fff;font-size:15px;letter-spacing:.02em}
    .detail-footer-links a{display:block;margin:9px 0;color:#facc15;font-size:14px;font-weight:650;line-height:1.35;text-decoration:none}
    .detail-footer-links a:hover{text-decoration:underline}
    .detail-footer-bottom{width:min(1120px,100%);margin:28px auto 0;padding-top:20px;border-top:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.82);text-align:center;font-size:13px}
    @media(max-width:1000px){.university-detail-page .nav-links{gap:11px}.university-detail-page .nav-links a{font-size:14px}.facts-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:800px){.detail-hero h1{font-size:34px}.content-layout{grid-template-columns:1fr;gap:30px}.related-grid{grid-template-columns:1fr}.detail-footer-inner{grid-template-columns:1fr}.detail-footer-links{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){.detail-container{width:min(100% - 28px,1120px)}.detail-hero{padding:24px 0 34px}.detail-breadcrumb{margin-bottom:22px;font-size:13px}.detail-hero h1{font-size:29px}.hero-summary{font-size:16px}.detail-main{padding:24px 0 48px}.quick-answer{padding:18px}.quick-answer h2,.content-section h2,.related-section h2{font-size:21px}.facts-grid{grid-template-columns:1fr;gap:10px}.fact-card{min-height:94px;padding:15px}.detail-footer-links{grid-template-columns:1fr}.detail-footer{padding-inline:16px}}
  </style>
</head>
<body class="university-detail-page">
  <nav class="main-nav" aria-label="Main navigation">
    <a href="/" class="logo desktop-nav">Career Unified</a>
    <div class="nav-links desktop-nav">
      <a href="/jobs">Jobs</a>
      <a href="/bursaries">Bursaries</a>
      <a href="/varsity" aria-current="page">Varsities</a>
      <a href="/cv-generator/">Generate CV</a>
      <a href="/z83-filler">Z83 Filler</a>
      <a href="/cv-tips">CV Tips</a>
      <a href="/login.html">Login</a>
      <a href="/account-page.html" class="icon-btn desktop-account-btn" aria-label="My Account" title="My Account">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </a>
    </div>
    <div class="mobile-nav">
      <a href="/" class="mobile-logo">Career Unified</a>
      <div class="mobile-nav-right">
        <a href="/account-page.html" class="icon-btn" aria-label="My Account">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </a>
        <button class="icon-btn" id="menuBtn" type="button" aria-label="Main Menu" aria-controls="mobileMenu" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </div>
  </nav>

  <div class="mobile-menu" id="mobileMenu">
    <a href="/jobs">Jobs</a>
    <a href="/bursaries">Bursaries</a>
    <a href="/varsity" aria-current="page">Varsities</a>
    <a href="/cv-generator/">Generate CV</a>
    <a href="/z83-filler">Z83 Filler</a>
    <a href="/cv-tips">CV Tips</a>
    <a href="/recruiter-dashboard.html">Recruiter Dashboard</a>
    <a href="/recruiter-apply.html">Apply as Recruiter</a>
    <a href="/saved-items.html">Saved Items</a>
    <a href="/signup.html">Sign Up</a>
    <a href="/login.html">Login</a>
  </div>

  <header class="detail-hero">
    <div class="detail-container">
      <nav aria-label="Breadcrumb">
        <ol class="detail-breadcrumb">
          <li><a href="/">Home</a></li>
          <li aria-hidden="true">/</li>
          <li><a href="/varsity">Varsities</a></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">${escapeHtml(name)}</li>
        </ol>
      </nav>
      <p class="detail-eyebrow">South African university application guide</p>
      <h1>${escapeHtml(name)} Application Fee and Closing Date</h1>
      <p class="hero-summary">Check the listed application fee, registration cost, closing date and official application route for ${escapeHtml(name)}.</p>
      <div class="hero-meta">
        <span class="status-pill">${escapeHtml(status)}</span>
        <span>${escapeHtml(reviewedText)}</span>
      </div>
    </div>
  </header>

  <main class="detail-main">
    <div class="detail-container">
      <section class="quick-answer" aria-labelledby="application-fee-answer">
        <h2 id="application-fee-answer">How much is the ${escapeHtml(name)} application fee?</h2>
        <p>${escapeHtml(applicationFeeAnswer)}</p>
      </section>

      <section class="facts-grid" aria-label="Application facts">
        ${factCard("Application fee", applicationFee || "Not listed", "fee")}
        ${factCard("Registration fee", registrationFee || "Not listed", "registration")}
        ${factCard("Application closing date", deadline.display || "TBA", "deadline")}
        ${factCard("Application status", status, "status")}
      </section>

      <div class="content-layout">
        <article>
          <section class="content-section">
            <h2>${escapeHtml(name)} application fee</h2>
            <p>${escapeHtml(applicationFeeAnswer)}</p>
          </section>
          <section class="content-section">
            <h2>${escapeHtml(name)} registration fee</h2>
            <p>${escapeHtml(registrationFeeAnswer)}</p>
          </section>
          <section class="content-section">
            <h2>${escapeHtml(name)} application closing date</h2>
            <p>${escapeHtml(deadlineAnswer)}</p>
          </section>
          ${notesHtml ? `<section class="content-section"><h2>Latest application information</h2>${notesHtml}</section>` : ""}
          <section class="content-section">
            <h2>How to apply to ${escapeHtml(name)}</h2>
            <ol class="application-steps">
              <li>Review the programme requirements and intake dates on the university's official website.</li>
              <li>Prepare the requested identity, academic and supporting documents before starting.</li>
              <li>Complete the official application and pay only through a payment channel confirmed by the university.</li>
              <li>Save your application reference and proof of payment, then monitor your application status.</li>
            </ol>
          </section>
        </article>

        <aside class="source-panel" aria-labelledby="source-heading">
          <h2 id="source-heading">Official source</h2>
          <p>Fees, dates and admission requirements can change. Always confirm the final details with ${escapeHtml(name)} before submitting or paying.</p>
          <p><strong>${escapeHtml(reviewedText)}</strong></p>
          <div class="detail-actions">
            ${officialUrl ? `<a id="officialApplicationLink" class="detail-button detail-button--primary" href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">Visit official application page</a>` : ""}
            <a id="browseVarsitiesLink" class="detail-button detail-button--secondary" href="/varsity">Browse all Varsities</a>
          </div>
        </aside>
      </div>

      <section class="related-section" aria-labelledby="related-heading">
        <h2 id="related-heading">Prepare your next application</h2>
        <div class="related-grid">
          <a class="related-link" id="relatedVarsitiesLink" href="/varsity"><strong>Compare Varsities</strong><span>Review application fees and closing dates in one place.</span></a>
          <a class="related-link" id="relatedBursariesLink" href="/bursaries"><strong>Find Bursaries</strong><span>Search funding opportunities and upcoming deadlines.</span></a>
          <a class="related-link" id="relatedCvLink" href="/cv-generator/"><strong>Build your CV</strong><span>Create a clear CV for internships, learnerships and work applications.</span></a>
        </div>
      </section>
    </div>
  </main>

  <footer class="detail-footer">
    <div class="detail-footer-inner">
      <div class="detail-footer-brand">
        <strong>Career Unified</strong>
        <p>Jobs, bursaries, university application information and practical career tools for South Africans.</p>
      </div>
      <nav class="detail-footer-links" aria-label="Footer navigation">
        <div><h2>Opportunities</h2><a href="/jobs">Jobs</a><a href="/bursaries">Bursaries</a><a href="/varsity">Varsities</a></div>
        <div><h2>Career tools</h2><a href="/cv-generator/">Generate CV</a><a href="/z83-filler">Z83 Filler</a><a href="/cv-tips">CV Tips</a></div>
        <div><h2>Company</h2><a href="/about-us">About Us</a><a href="/contact-us">Contact Us</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a></div>
      </nav>
    </div>
    <div class="detail-footer-bottom">&copy; 2026 Career Unified. All rights reserved.</div>
  </footer>

  <script>
    const menuButton = document.getElementById('menuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const setMenuOpen = (open) => {
      if (!menuButton || !mobileMenu) return;
      mobileMenu.style.display = open ? 'block' : 'none';
      menuButton.setAttribute('aria-expanded', String(open));
    };

    menuButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('click', (event) => {
      if (mobileMenu && !mobileMenu.contains(event.target) && event.target !== menuButton) {
        setMenuOpen(false);
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) setMenuOpen(false);
    });

    const analyticsContext = ${jsonLd(analyticsContext)};
    gtag('event', 'university_detail_view', analyticsContext);

    const trackClick = (id, eventName) => {
      document.getElementById(id)?.addEventListener('click', () => {
        gtag('event', eventName, {...analyticsContext, transport_type: 'beacon'});
      });
    };
    trackClick('officialApplicationLink', 'university_official_apply_click');
    trackClick('browseVarsitiesLink', 'university_browse_all_click');
    trackClick('relatedVarsitiesLink', 'university_browse_all_click');
    trackClick('relatedBursariesLink', 'university_bursary_click');
    trackClick('relatedCvLink', 'university_cv_click');
  </script>
  <script src="/js/cookie-notice.js"></script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300, stale-while-revalidate=1800",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("varsity edge error:", error);
    return new Response("Unable to load university", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
};
