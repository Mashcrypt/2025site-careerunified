const byId = id => document.getElementById(id);
const text = value => String(value || "").trim();
let site = null;
let jobs = [];

function renderJobs() {
  const query = text(byId("jobSearch")?.value).toLowerCase();
  const visible = jobs.filter(job => [job.title, job.location, job.type, job.category].join(" ").toLowerCase().includes(query));
  const list = byId("jobList");
  list.replaceChildren();
  if (!visible.length) { const empty = document.createElement("p"); empty.className = "state"; empty.textContent = query ? "No open positions match your search." : "There are no open positions right now."; list.append(empty); return; }
  visible.forEach(job => {
    const card = document.createElement("a"); card.className = "job-card"; card.href = `/?job=${encodeURIComponent(job.slug || job.id)}`;
    const title = document.createElement("h3"); title.textContent = job.title; card.append(title);
    const meta = document.createElement("p"); meta.className = "job-meta"; meta.textContent = [job.location, job.type, job.deadline ? `Closes ${job.deadline}` : "Open until filled"].filter(Boolean).join(" • "); card.append(meta);
    const tags = document.createElement("div"); tags.className = "tags"; [job.category, job.type].filter(Boolean).forEach(value => { const tag = document.createElement("span"); tag.textContent = value; tags.append(tag); }); card.append(tags); list.append(card);
  });
}

function renderDetail(job) {
  byId("jobDetail").hidden = false;
  byId("detailTitle").textContent = job.title;
  byId("detailMeta").textContent = [job.location, job.type, job.deadline ? `Closes ${job.deadline}` : "Open until filled"].filter(Boolean).join(" • ");
  renderFormattedText(byId("detailDescription"), job.overview || job.description);
  renderDetailSection("detailResponsibilities", "responsibilitiesContent", job.responsibilities);
  renderDetailSection("detailRequirements", "requirementsContent", job.requirements);
  renderCompanySocialLinks();
  byId("applyLink").href = `/apply.html?jobId=${encodeURIComponent(job.id)}&careerSite=1&companyId=${encodeURIComponent(site.companyId)}`;
  history.replaceState({}, "", `/?job=${encodeURIComponent(job.slug || job.id)}`);
  document.body.classList.add("job-detail-open");
}

function renderCompanySocialLinks() {
  const container = byId("companySocialLinks");
  container.replaceChildren();
  const links = [
    ["linkedin", "LinkedIn", "in"], ["twitter", "X", "X"],
    ["instagram", "Instagram", "◎"], ["facebook", "Facebook", "f"]
  ].filter(([key]) => /^https:\/\//i.test(text(site.socialLinks?.[key])));
  if (!links.length) { container.hidden = true; return; }
  container.hidden = false;
  const label = document.createElement("span"); label.className = "company-social-label"; label.textContent = "Follow this employer"; container.append(label);
  links.forEach(([key, name, icon]) => { const link = document.createElement("a"); link.href = site.socialLinks[key]; link.target = "_blank"; link.rel = "noopener noreferrer"; link.className = `company-social-link company-social-${key}`; link.title = `Follow on ${name}`; link.setAttribute("aria-label", `Follow on ${name}`); link.innerHTML = `<span aria-hidden="true">${icon}</span>`; container.append(link); });
}

function closeDetail() {
  byId("jobDetail").hidden = true;
  document.body.classList.remove("job-detail-open");
  history.pushState({}, "", "/");
}

function renderFormattedText(container, value) {
  container.replaceChildren();
  const lines = text(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let list = null;
  lines.forEach(line => {
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const type = numbered ? "ol" : "ul";
      if (!list || list.tagName.toLowerCase() !== type) { list = document.createElement(type); container.append(list); }
      const item = document.createElement("li"); item.textContent = (bullet || numbered)[1]; list.append(item);
      return;
    }
    list = null;
    const paragraph = document.createElement("p"); paragraph.textContent = line; container.append(paragraph);
  });
}

function renderDetailSection(sectionId, contentId, value) {
  const section = byId(sectionId); const content = byId(contentId);
  const present = Boolean(text(value));
  section.hidden = !present;
  if (present) renderFormattedText(content, value);
}

async function loadCareerSite() {
  const params = new URLSearchParams(location.search);
  const localCompany = location.hostname.endsWith("localhost") || location.hostname.startsWith("127.") ? params.get("company") || "" : "";
  const response = await fetch(`/.netlify/functions/career-site-public${localCompany ? `?company=${encodeURIComponent(localCompany)}` : ""}`, {headers:{Accept:"application/json"}});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Career site not found.");
  site = payload.site; jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  document.title = site.seo?.title || `${site.displayName} careers`;
  document.querySelector('meta[name="description"]').content = site.seo?.description || "Explore open roles and careers.";
  byId("canonicalUrl").href = location.origin + location.pathname;
  byId("ogTitle").content = document.title;
  byId("ogDescription").content = site.seo?.description || "Explore open roles and careers.";
  document.documentElement.style.setProperty("--primary", site.brandColors?.primary || "#0d47ff");
  document.body.dataset.layout = site.layout || "bold";
  const bannerImage = text(site.media?.bannerImage);
  if (bannerImage) document.documentElement.style.setProperty("--hero-image", `url("${bannerImage.replace(/"/g, "\\\"")}")`);
  byId("siteName").textContent = site.displayName; byId("siteHeading").textContent = site.displayName;
  byId("siteTagline").textContent = site.tagline; byId("siteAbout").textContent = site.about;
  byId("siteLogo").src = site.logo || "/android-chrome-192x192.png"; byId("siteLogo").alt = `${site.displayName} logo`;
  byId("contactDetails").textContent = site.contact?.email || "";
  const structuredData = {"@context":"https://schema.org", "@type":"Organization", name:site.displayName, url:location.origin, logo:site.logo || undefined, sameAs:Object.values(site.socialLinks || {}).filter(Boolean)};
  const schema = document.createElement("script"); schema.type = "application/ld+json"; schema.textContent = JSON.stringify(structuredData); document.head.append(schema);
  const jobPostingList = document.createElement("script"); jobPostingList.type = "application/ld+json"; jobPostingList.textContent = JSON.stringify({"@context":"https://schema.org", "@type":"ItemList", itemListElement:jobs.map((job, index) => ({"@type":"ListItem", position:index + 1, url:`${location.origin}/jobs/${encodeURIComponent(job.slug || job.id)}`, name:job.title}))}); document.head.append(jobPostingList);
  renderJobs();
  const pathJob = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const requestedJob = new URLSearchParams(location.search).get("job") || "";
  const selected = jobs.find(job => job.slug === (requestedJob || pathJob) || job.id === (requestedJob || pathJob));
  if (selected) renderDetail(selected);
}

byId("jobSearch")?.addEventListener("input", renderJobs);
byId("backToJobs")?.addEventListener("click", closeDetail);
byId("jobDetail")?.addEventListener("click", event => { if (event.target === event.currentTarget) closeDetail(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !byId("jobDetail")?.hidden) closeDetail(); });
loadCareerSite().catch(error => { byId("siteError").hidden = false; byId("siteError").textContent = error.message; });
