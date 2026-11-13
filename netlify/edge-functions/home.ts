import {getActiveBursaries, getActiveJobs, getUniversities} from "../lib/sanity.ts";

type EdgeContext = {
  next: () => Promise<Response>;
  rewrite: (url: URL) => Promise<Response>;
};

type JobSummary = {
  _id?: string;
  slug?: string;
  title?: string;
  companyName?: string;
  companyLogo?: string;
  location?: string;
  salary?: string;
  applyLink?: string;
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
      const id = String(job._id || "").trim();
      const title = String(job.title || "Job opportunity").trim();
      const company = String(job.companyName || "Confidential").trim();
      const logoUrl = /^https:\/\/cdn\.sanity\.io\/images\//.test(String(job.companyLogo || ""))
        ? String(job.companyLogo)
        : "";
      const initials = company.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase() || "CU";
      const detailUrl = slug ? `/jobs?slug=${encodeURIComponent(slug)}` : "/jobs";
      const logo = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="" loading="lazy" decoding="async">`
        : escapeHtml(initials);
      const category = job.category
        ? `<div class="home-job-card-details"><span class="home-job-card-category">${escapeHtml(job.category)}</span></div>`
        : '<div class="home-job-card-details"></div>';
      const salary = job.salary ? `<span class="home-job-card-salary">${escapeHtml(job.salary)}</span>` : "";
      const location = job.location ? `<span class="home-job-card-location">${escapeHtml(job.location)}</span>` : "";

      return `<article class="job-card" data-home-job-card data-job-id="${escapeHtml(id)}" data-job-slug="${escapeHtml(slug)}" data-job-title="${escapeHtml(title)}" data-job-company="${escapeHtml(company)}" data-job-location="${escapeHtml(job.location || "")}" data-job-salary="${escapeHtml(job.salary || "")}" data-job-apply-link="${escapeHtml(job.applyLink || "")}">
        <div class="home-job-card-company">
          <span class="home-job-card-logo">${logo}</span>
          <span class="home-job-card-company-name">${escapeHtml(company)}</span>
          <div class="home-job-card-actions">
            <button type="button" class="home-job-card-save" data-home-job-save="${escapeHtml(id)}" data-job-title="${escapeHtml(title)}" aria-label="Save job: ${escapeHtml(title)}" aria-pressed="false" ${id ? "" : "disabled"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.75A1.75 1.75 0 0 1 8.25 2h7.5a1.75 1.75 0 0 1 1.75 1.75V22l-5.75-3.75L6 22V3.75Z"/></svg><span data-save-label>Save</span>
            </button>
          </div>
        </div>
        <h3 class="home-job-card-title"><a class="home-job-card-title-link" href="${escapeHtml(detailUrl)}" data-cro-event="home_job_open" data-job-title="${escapeHtml(title)}" data-job-company="${escapeHtml(company)}">${escapeHtml(title)}</a></h3>
        ${category}
        <div class="home-job-card-footer">
          <div class="home-job-card-meta">${salary}${location}</div>
          <a class="home-job-card-apply" href="${escapeHtml(detailUrl)}" data-cro-event="home_job_open" data-job-title="${escapeHtml(title)}" data-job-company="${escapeHtml(company)}">Apply now</a>
        </div>
      </article>`;
    })
    .join("");
}

function replaceFirst(html: string, search: string, replacement: string) {
  return html.includes(search) ? html.replace(search, replacement) : html;
}

export default async (request: Request, context: EdgeContext) => {
  // The home edge function also matches `/` on wildcard career-site hosts.
  // Rewrite those requests before the main homepage is rendered.
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0].trim().toLowerCase().split(":")[0];
  const isProductionCareerHost = host.endsWith(".careerunified.com") && host !== "www.careerunified.com";
  const isLocalCareerHost = host.endsWith(".localhost") || host.endsWith(".127.0.0.1") || host.endsWith(".nip.io");
  if (isProductionCareerHost || isLocalCareerHost) {
    return context.rewrite(new URL("/career-site.html", request.url));
  }

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
