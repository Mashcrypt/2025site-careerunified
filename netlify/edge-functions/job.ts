import { getJob } from "../lib/sanity.ts";

export default async (request: Request) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");

  // If no job in URL → let Netlify serve normal jobs.html
  if (!jobId) {
    return fetch(request);
  }

  const job = await getJob(jobId);

  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<title>${job.title} – ${job.company} | Career Unified</title>

<meta name="description" content="${job.title} at ${job.company} in ${job.location}. Apply before ${job.deadline}.">

<meta property="og:type" content="website">
<meta property="og:title" content="${job.title}">
<meta property="og:description" content="Apply for ${job.title} at ${job.company} in ${job.location}">
<meta property="og:url" content="https://careerunified.com/jobs?job=${job._id}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${job.title}">
<meta name="twitter:description" content="Apply for ${job.title} at ${job.company}">

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
    "name": "${job.company}"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "ZA"
    }
  }
}
</script>

<meta http-equiv="refresh" content="0; url=/jobs.html?job=${job._id}">
</head>

<body>
<h1>${job.title}</h1>
<p>${job.company}</p>
<p>${job.location}</p>
<p>${job.deadline}</p>
</body>
</html>
`;

  return new Response(html, {
    headers: { "content-type": "text/html" }
  });
};
