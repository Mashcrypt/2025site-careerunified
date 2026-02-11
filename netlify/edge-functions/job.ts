import { getJob } from "../lib/sanity.ts";

export default async (request: Request) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");

  // If no job in URL → serve real HTML (NOT /jobs)
  if (!jobId) {
    return fetch("https://careerunified.com/jobs.html");
  }

  const job = await getJob(jobId);

  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  const ogImage =
    job.company?.logo?.asset?.url ||
    "https://careerunified.com/static/og-default.jpg";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<title>${job.title} – ${job.company.name} | Career Unified</title>

<meta name="description" content="${job.title} at ${job.company.name} in ${job.location}. Salary: ${job.salary || "Market related"}">

<meta property="og:type" content="website">
<meta property="og:title" content="${job.title} – ${job.company.name}">
<meta property="og:description" content="${job.location} • ${job.salary || "Market related"}">
<meta property="og:image" content="${ogImage}">
<meta property="og:url" content="https://careerunified.com/jobs?job=${job._id}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${job.title}">
<meta name="twitter:description" content="${job.company.name} • ${job.location}">
<meta name="twitter:image" content="${ogImage}">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "${job.title}",
  "description": "${job.description.replace(/"/g, "'")}",
  "datePosted": "${job.posted}",
  "validThrough": "${job.deadline}",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "${job.company.name}",
    "logo": "${ogImage}"
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

<meta http-equiv="refresh" content="0; url=/jobs.html?job=${job._id}">
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html",
      "cache-control": "public, max-age=300"
    }
  });
};



