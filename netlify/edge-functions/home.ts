import {getActiveBursaries, getActiveJobs, getUniversities} from "../lib/sanity.ts";

type EdgeContext = {
  next: () => Promise<Response>;
};

type JobSummary = {
  slug?: string;
  title?: string;
  companyName?: string;
  location?: string;
  deadline?: string;
  deadlineText?: string;
  category?: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderRecentJobs(jobs: JobSummary[]) {
  return jobs
    .slice(0, 8)
    .map((job) => {
      const slug = String(job.slug || "").trim();
      const url = slug ? `/jobs/${encodeURIComponent(slug)}` : "/jobs";
      const closing = String(job.deadlineText || job.deadline || "Not specified").trim();

      return `<a href="${escapeHtml(url)}" class="job-card" data-cro-event="home_job_open" data-job-title="${escapeHtml(job.title || "")}" data-job-company="${escapeHtml(job.companyName || "Confidential")}" style="text-decoration:none;color:inherit">
        <h3>
          ${escapeHtml(job.title || "Job opportunity")}
          ${job.category ? `<span class="badge">${escapeHtml(job.category)}</span>` : ""}
        </h3>
        <p class="company">${escapeHtml(job.companyName || "Confidential")}</p>
        <p>${escapeHtml(job.location || "South Africa")}</p>
        <p class="meta">Closing: ${escapeHtml(closing)}</p>
        <span class="job-card-action">View job details <span aria-hidden="true">&rarr;</span></span>
      </a>`;
    })
    .join("");
}

function replaceFirst(html: string, search: string, replacement: string) {
  return html.includes(search) ? html.replace(search, replacement) : html;
}

export default async (_request: Request, context: EdgeContext) => {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || !contentType.includes("text/html")) return response;

  try {
    const [jobs, bursaries, universities] = await Promise.all([
      getActiveJobs().catch((error) => {
        console.error("home jobs fetch error:", error);
        return [];
      }),
      getActiveBursaries().catch((error) => {
        console.error("home bursaries fetch error:", error);
        return [];
      }),
      getUniversities().catch((error) => {
        console.error("home universities fetch error:", error);
        return [];
      }),
    ]);

    let html = await response.clone().text();
    html = replaceFirst(html, '<h3 id="statJobs">0+</h3>', `<h3 id="statJobs">${jobs.length}+</h3>`);
    html = replaceFirst(html, '<h3 id="statBursaries">0+</h3>', `<h3 id="statBursaries">${bursaries.length}+</h3>`);
    html = replaceFirst(html, '<h3 id="statVarsity">0</h3>', `<h3 id="statVarsity">${universities.length}</h3>`);
    html = replaceFirst(html, '<div class="job-cards" id="homeJobList"></div>', `<div class="job-cards" id="homeJobList">${renderRecentJobs(jobs)}</div>`);
    html = html.replace(
      "</head>",
      `<script type="application/ld+json" data-server-rendered="home-jobs">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Recent jobs in South Africa",
        numberOfItems: Math.min(jobs.length, 8),
        itemListElement: jobs.slice(0, 8).map((job: JobSummary, index: number) => ({
          "@type": "ListItem",
          position: index + 1,
          name: job.title || "Job opportunity",
          url: `https://careerunified.com/jobs/${encodeURIComponent(String(job.slug || ""))}`,
        })),
      }).replace(/</g, "\\u003c")}</script>\n</head>`,
    );

    const headers = new Headers(response.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "public, max-age=300, stale-while-revalidate=1800");
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("etag");

    return new Response(html, {status: response.status, headers});
  } catch (error) {
    console.error("home edge error:", error);
    return response;
  }
};
