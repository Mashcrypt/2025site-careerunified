import { getSanityJob } from "./sanity";

export default async (request) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");

  if (!jobId) return;

  const job = await getSanityJob(jobId);
  if (!job) return;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${job.title} at ${job.company} – Career Unified</title>
  <meta name="description" content="${job.title} at ${job.company}. Apply before ${job.deadline}.">
  <meta property="og:title" content="${job.title} at ${job.company}">
  <meta property="og:description" content="${job.location}. Apply before ${job.deadline}">
  <meta property="og:url" content="https://careerunified.com/jobs?job=${job._id}">
  <meta http-equiv="refresh" content="0;url=/jobs.html?job=${job._id}">
</head>
<body>Loading…</body>
</html>
`;

  return new Response(html, {
    headers: { "content-type": "text/html" }
  });
};
