import {getActiveBursaries, getActiveJobs, getBursaryBySlug, getJobBySlug, getUniversities} from "../lib/sanity.ts";
import {getRecruiterJobBySlug} from "../lib/firestore.ts";

const SITE_URL = "https://careerunified.com";

type JobSummary = {
  slug: string;
  title?: string;
  companyName?: string;
  companyLogo?: string;
  location?: string;
  deadline?: string;
};

type BursarySummary = {
  slug: string;
  name?: string;
  provider?: string;
  faculty?: string;
  faculties?: string[];
  deadline?: string;
};

type UniversitySummary = {
  slug: string;
  name?: string;
  applicationFee?: string;
  registrationFee?: string;
  deadline?: string;
  notes?: string;
};

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

function itemListSchema(name: string, items: Array<{name: string; url: string}>) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

function renderJobs(jobs: JobSummary[]) {
  return jobs
    .map((job) => {
      const url = `/jobs/${encodeURIComponent(job.slug)}`;
      return `<li class="job-card" data-job-url="${url}">
        <div class="job-row">
          <img src="${escapeHtml(job.companyLogo || "/fallback-company.png")}" class="company-logo" alt="${escapeHtml(job.companyName || "Company")} logo" width="80" height="80" loading="lazy">
          <div>
            <a class="job-title-link" href="${url}"><h3>${escapeHtml(job.title || "Job opportunity")}</h3></a>
            <p>${escapeHtml(job.companyName || "Confidential")}</p>
            <p>${escapeHtml(job.location || "South Africa")}</p>
            <p><strong>Closing:</strong> ${escapeHtml(job.deadline || "Not specified")}</p>
          </div>
        </div>
      </li>`;
    })
    .join("");
}

function renderBursaries(bursaries: BursarySummary[]) {
  return bursaries
    .map((bursary) => {
      const url = `/bursary/${encodeURIComponent(bursary.slug)}`;
      const faculties = Array.isArray(bursary.faculties) && bursary.faculties.length
        ? bursary.faculties.join(", ")
        : bursary.faculty || "All fields";
      return `<li class="bursary-card">
        <a class="bursary-title-link" href="${url}"><strong>${escapeHtml(bursary.name || "Bursary opportunity")}</strong></a>
        <p><strong>Faculty:</strong> ${escapeHtml(faculties)}</p>
        <p><strong>Provider:</strong> ${escapeHtml(bursary.provider || "Not specified")}</p>
        <p><strong>Deadline:</strong> ${escapeHtml(bursary.deadline || "Not specified")}</p>
      </li>`;
    })
    .join("");
}

function renderUniversities(universities: UniversitySummary[]) {
  return universities
    .map((university) => {
      const url = `/varsity/${encodeURIComponent(university.slug)}`;
      const details = [
        university.applicationFee
          ? `<small>Application Fee: ${escapeHtml(university.applicationFee)}</small>`
          : "",
        university.registrationFee
          ? `<small>Registration Fee: ${escapeHtml(university.registrationFee)}</small>`
          : "",
        `<small>Application Deadline: ${escapeHtml(university.deadline || "TBA")}</small>`,
        university.notes ? `<small>${escapeHtml(university.notes)}</small>` : "",
      ].join("");

      return `<li class="varsity-card">
        <a href="${url}">${escapeHtml(university.name || "University")}</a>
        ${details}
      </li>`;
    })
    .join("");
}

type EdgeContext = {
  next: () => Promise<Response>;
};

export default async (request: Request, context: EdgeContext) => {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;
  const legacyJobSlug = requestUrl.searchParams.get("slug")?.trim() || "";
  const legacyBursarySlug = requestUrl.searchParams.get("slug")?.trim() || "";
  const desktopView = requestUrl.searchParams.get("view") === "desktop";
  let scrollLegacyJobIntoView = false;

  if (
    (pathname === "/jobs" || pathname === "/jobs.html") &&
    legacyJobSlug &&
    !desktopView
  ) {
    const [sanityResult, recruiterResult] = await Promise.allSettled([
      getJobBySlug(legacyJobSlug),
      getRecruiterJobBySlug(legacyJobSlug),
    ]);
    if (sanityResult.status === "rejected") {
      console.error("legacy Sanity job lookup error:", sanityResult.reason);
    }
    if (recruiterResult.status === "rejected") {
      console.error("legacy recruiter job lookup error:", recruiterResult.reason);
    }

    const job = sanityResult.status === "fulfilled" && sanityResult.value
      ? sanityResult.value
      : recruiterResult.status === "fulfilled"
      ? recruiterResult.value
      : null;
    if (job) {
      const canonicalSlug = job.slug || legacyJobSlug;
      return Response.redirect(
        `${SITE_URL}/jobs/${encodeURIComponent(canonicalSlug)}`,
        301,
      );
    }

    scrollLegacyJobIntoView = true;
  }

  if (
    (pathname === "/bursaries" || pathname === "/bursaries.html") &&
    legacyBursarySlug &&
    !desktopView
  ) {
    try {
      const bursary = await getBursaryBySlug(legacyBursarySlug);
      if (bursary) {
        const canonicalSlug = bursary.slug || legacyBursarySlug;
        return Response.redirect(
          `${SITE_URL}/bursary/${encodeURIComponent(canonicalSlug)}`,
          301,
        );
      }
    } catch (error) {
      console.error("legacy bursary lookup error:", error);
    }
  }

  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || !contentType.includes("text/html")) return response;

  try {
    let marker = "";
    let listHtml = "";
    let schema: Record<string, unknown> | null = null;

    if (pathname === "/jobs" || pathname === "/jobs.html") {
      const jobs = await getActiveJobs();
      marker = "<!-- SSR_JOB_LIST -->";
      listHtml = renderJobs(jobs);
      schema = itemListSchema(
        "Active jobs in South Africa",
        jobs.map((job: JobSummary) => ({
          name: job.title || "Job opportunity",
          url: `${SITE_URL}/jobs/${encodeURIComponent(job.slug)}`,
        })),
      );
    } else if (pathname === "/bursaries" || pathname === "/bursaries.html") {
      const bursaries = await getActiveBursaries();
      marker = "<!-- SSR_BURSARY_LIST -->";
      listHtml = renderBursaries(bursaries);
      schema = itemListSchema(
        "Active bursaries in South Africa",
        bursaries.map((bursary: BursarySummary) => ({
          name: bursary.name || "Bursary opportunity",
          url: `${SITE_URL}/bursary/${encodeURIComponent(bursary.slug)}`,
        })),
      );
    } else if (pathname === "/varsity" || pathname === "/varsity.html") {
      const universities = await getUniversities();
      marker = "<!-- SSR_VARSITY_LIST -->";
      listHtml = renderUniversities(universities);
      schema = itemListSchema(
        "South African university applications",
        universities.map((university: UniversitySummary) => ({
          name: university.name || "University",
          url: `${SITE_URL}/varsity/${encodeURIComponent(university.slug)}`,
        })),
      );
    } else {
      return response;
    }

    let html = await response.clone().text();
    html = html.replace(marker, listHtml);
    html = html.replace(
      "</head>",
      `<script type="application/ld+json" data-server-rendered="true">${jsonLd(schema)}</script>\n</head>`,
    );
    if (scrollLegacyJobIntoView) {
      html = html.replace(
        "</body>",
        `<script>
          (() => {
            if (!window.matchMedia("(max-width: 900px)").matches) return;
            const preview = document.getElementById("jobPreview");
            if (!preview) return;

            const showLoadedJob = () => {
              if (!preview.querySelector(".preview-slide")) return false;
              preview.scrollIntoView({behavior: "auto", block: "start"});
              return true;
            };

            if (showLoadedJob()) return;
            const observer = new MutationObserver(() => {
              if (showLoadedJob()) observer.disconnect();
            });
            observer.observe(preview, {childList: true, subtree: true});
            window.setTimeout(() => observer.disconnect(), 15000);
          })();
        </script>
      </body>`,
      );
    }

    const headers = new Headers(response.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "public, max-age=300, stale-while-revalidate=1800");
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("etag");

    return new Response(html, {status: response.status, headers});
  } catch (error) {
    console.error("content listing edge error:", error);
    return response;
  }
};
