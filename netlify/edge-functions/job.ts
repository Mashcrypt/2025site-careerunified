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

  const image =
    job.companyLogo ||
    "https://careerunified.com/static/default-company.png"; // fallback image

  const safeDescription = job.description
    ? job.description.replace(/"/g, "'").slice(0, 160)
    : "";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<title>${job.title} at ${job.companyName} | Career Unified</title>

<meta name="description" content="${job.title} at ${job.companyName} in ${job.location}. Apply before ${job.deadline}.">

<!-- Open Graph / WhatsApp -->
<meta property="og:type" content="website">
<meta property="og:title" content="${job.title} at ${job.companyName}">
<meta property="og:description" content="${job.title} • ${job.location} • ${job.salary || "Apply now"}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="https://careerunified.com/jobs?job=${job._id}">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${job.title} at ${job.companyName}">
<meta name="twitter:description" content="${job.location} • ${job.salary || "Apply now"}">
<meta name="twitter:image" content="${image}">

<!-- Google Job Posting Schema -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "${job.title}",
  "description": "${safeDescription}",
  "datePosted": "${job.posted}",
  "validThrough": "${job.deadline}",
  "employmentType": "FULL_TIME",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "${job.companyName}",
    "logo": "${image}"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "${job.location}",
      "addressCountry": "ZA"
    }
  }
}
</script>

<!-- Redirect real users to SPA -->
<meta http-equiv="refresh" content="0; url=/jobs.html?job=${job._id}">
</head>

<body>
<h1>${job.title}</h1>
<p>${job.companyName}</p>
<p>${job.location}</p>
<p>${job.salary || ""}</p>
</body>
</html>
`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
};

