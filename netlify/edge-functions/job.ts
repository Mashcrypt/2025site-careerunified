import { getJob } from "../lib/sanity.ts";

export default async (request: Request) => {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("job");

    if (!jobId) {
      return fetch(request);
    }

    const job = await getJob(jobId);

    if (!job) {
      return new Response("Job not found", { status: 404 });
    }

    const image = job.companyLogo || "https://careerunified.com/default-share.png";

    const html = `
<!DOCTYPE html>
<html>
<head>
<title>${job.title} – ${job.companyName}</title>

<meta name="description" content="${job.title} at ${job.companyName} in ${job.location}. Salary: ${job.salary || "Not specified"}">

<meta property="og:type" content="website">
<meta property="og:title" content="${job.title}">
<meta property="og:description" content="${job.companyName} • ${job.location} • ${job.salary || "Salary negotiable"}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="https://careerunified.com/jobs?job=${job._id}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${job.title}">
<meta name="twitter:description" content="${job.companyName}">
<meta name="twitter:image" content="${image}">

<meta http-equiv="refresh" content="0; url=/jobs.html?job=${job._id}">
</head>

<body>
<h1>${job.title}</h1>
<p>${job.companyName}</p>
</body>
</html>
`;

    return new Response(html, {
      headers: { "content-type": "text/html" }
    });

  } catch (err) {
    return new Response("Edge function error", { status: 500 });
  }
};
