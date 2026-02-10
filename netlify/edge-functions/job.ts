import { getJob } from "../lib/sanity.ts";

export default async (request: Request) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");

  // If no job in URL → let Netlify serve normal SPA
  if (!jobId) {
    return fetch(request);
  }

  const job = await getJob(jobId);

  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  // Helper: safely escape text for use inside HTML attributes and JSON strings
  const esc = (str: string | null | undefined): string => {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  // Helper: escape for JSON-LD (inside <script> tag)
  const escJson = (str: string | null | undefined): string => {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  };

  const title       = esc(job.title);
  const company     = esc(job.companyName);
  const location    = esc(job.location);
  const salary      = esc(job.salary) || "Apply now";
  const deadline    = esc(job.deadline);
  const description = esc(job.description?.slice(0, 160));

  // OG image: must be an absolute URL and ideally 1200x630
  // Sanity CDN supports resizing via URL params
  let ogImage = "https://careerunified.com/static/default-company.png";
  if (job.companyLogo) {
    // Request a 1200×630 crop so WhatsApp shows it reliably
    ogImage = `${job.companyLogo}?w=1200&h=630&fit=crop&auto=format`;
  }

  const jobUrl = `https://careerunified.com/jobs?job=${job._id}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} at ${company} | Career Unified</title>
<meta name="description" content="${title} at ${company} in ${location}. Apply before ${deadline}.">

<!-- ========================
     Open Graph / WhatsApp / Facebook
======================== -->
<meta property="og:type"        content="website">
<meta property="og:site_name"   content="Career Unified">
<meta property="og:url"         content="${jobUrl}">
<meta property="og:title"       content="${title} at ${company}">
<meta property="og:description" content="${location} • ${salary}">
<meta property="og:image"       content="${ogImage}">
<meta property="og:image:width"  content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt"   content="${company} logo">

<!-- ========================
     Twitter / X
======================== -->
<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:site"        content="@careerunified">
<meta name="twitter:title"       content="${title} at ${company}">
<meta name="twitter:description" content="${location} • ${salary}">
<meta name="twitter:image"       content="${ogImage}">

<!-- ========================
     Google Job Posting Schema
======================== -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "${escJson(job.title)}",
  "description": "${escJson(job.description?.slice(0, 500))}",
  "datePosted": "${escJson(job.posted)}",
  "validThrough": "${escJson(job.deadline)}",
  "employmentType": "FULL_TIME",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "${escJson(job.companyName)}",
    "logo": "${escJson(job.companyLogo || "")}"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "${escJson(job.location)}",
      "addressCountry": "ZA"
    }
  }
}
</script>

<!-- Redirect real users to the SPA immediately -->
<meta http-equiv="refresh" content="0; url=/jobs.html?job=${job._id}">
</head>
<body>
<!-- Visible fallback content for crawlers that don't follow meta-refresh -->
<h1>${title} at ${company}</h1>
<p><strong>Location:</strong> ${location}</p>
<p><strong>Salary:</strong> ${salary}</p>
<p><strong>Closing Date:</strong> ${deadline}</p>
<a href="${jobUrl}">View full job listing</a>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Tell CDNs/proxies not to cache this so previews stay fresh
      "cache-control": "no-cache, no-store, must-revalidate"
    }
  });
};
