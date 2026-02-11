import { getJob } from "../lib/sanity.ts";

export default async (request: Request) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");

  // If no job param → allow normal SPA to load
  if (!jobId) {
    return fetch(request);
  }

  const job = await getJob(jobId);

  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  // Use company logo if available, else fallback image
  const image =
    job.companyLogo ||
    "https://careerunified.com/images/default-job.png";

  // Escape text safely
  const safeTitle = job.title.replace(/"/g, "'");
  const safeCompany = job.company.replace(/"/g, "'");
  const safeLocation = job.location.replace(/"/g, "'");
  const safeDesc = job.description.replace(/"/g, "'");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<title>${safeTitle} – ${safeCompany} | Career Unified</title>

<meta name="description" content="${safeTitle} at ${safeCompany} in ${safeLocation}. Apply before ${job.deadline}.">

<meta property="og:type" content="website">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="Apply for ${safeTitle} at ${safeCompany} in ${safeLocation}">
<meta property="og:url" content="https://careerunified.com/jobs?job=${job._id}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="Apply for ${safeTitle} at ${safeCompany}">
<meta name="twitter:image" content="${image}">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "${safeTitle}",
  "description": "${safeDesc}",
  "datePosted": "${job.posted}",
  "validThrough": "${job.deadline}",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "${safeCompany}",
    "logo": "${image}"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "ZA",
      "addressLocality": "${safeLocation}"
    }
  }
}
</script>

<meta http-equiv="refresh" content="0; url=/jobs.html?job=${job._id}">
</head>

<body>
<h1>${safeTitle}</h1>
<p>${safeCompany}</p>
<p>${safeLocation}</p>
<p>Apply before ${job.deadline}</p>
</body>
</html>
`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=300"
    }
  });
};


