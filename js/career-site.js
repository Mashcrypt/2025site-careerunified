const byId = id => document.getElementById(id);
const text = value => String(value || "").trim();
let site = null;
let jobs = [];
let wirelessFilters = {category: "", location: "", type: ""};

function renderWirelessFilters() {
  const aside = byId("wirelessFilters");
  if (!aside) return;
  aside.replaceChildren();
  aside.hidden = document.body.dataset.layout !== "wireless";
  if (aside.hidden) return;
  const addGroup = (label, values, key) => {
    if (!values.length) return;
    const group = document.createElement("fieldset");
    const legend = document.createElement("legend");
    const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "wireless-filter-toggle"; toggle.setAttribute("aria-expanded", "true");
    const title = document.createElement("span"); title.textContent = label;
    const arrow = document.createElement("span"); arrow.className = "wireless-filter-arrow"; arrow.textContent = "⌃"; arrow.setAttribute("aria-hidden", "true");
    toggle.append(title, arrow); legend.append(toggle); group.append(legend);
    const options = document.createElement("div"); options.className = "wireless-filter-options";
    toggle.addEventListener("click", () => { const expanded = toggle.getAttribute("aria-expanded") === "true"; toggle.setAttribute("aria-expanded", String(!expanded)); options.hidden = expanded; arrow.textContent = expanded ? "⌄" : "⌃"; });
    const counts = new Map(values.map(value => [value, jobs.filter(job => text(job[key]) === value).length]));
    values.forEach(value => {
      const item = document.createElement("label"); item.className = "wireless-filter-option";
      const input = document.createElement("input"); input.type = "checkbox"; input.checked = wirelessFilters[key] === value; input.setAttribute("aria-label", `${label}: ${value}`);
      input.addEventListener("change", () => { wirelessFilters[key] = input.checked ? value : ""; renderWirelessFilters(); renderJobs(); });
      const textNode = document.createElement("span"); textNode.textContent = `${value} (${counts.get(value) || 0})`; item.append(input, textNode); options.append(item);
    });
    group.append(options); aside.append(group);
  };
  const categories = [...new Set(jobs.map(job => text(job.category)).filter(Boolean))].sort();
  const locations = [...new Set(jobs.map(job => text(job.location)).filter(Boolean))].sort();
  const types = [...new Set(jobs.map(job => text(job.type)).filter(Boolean))].sort();
  addGroup("Job category", categories, "category");
  addGroup("Locations", locations, "location");
  addGroup("Job type", types, "type");
}

function renderJobs() {
  const query = text(byId("jobSearch")?.value).toLowerCase();
  const visible = jobs.filter(job => [job.title, job.location, job.type, job.category].join(" ").toLowerCase().includes(query)
    && (!wirelessFilters.category || text(job.category) === wirelessFilters.category)
    && (!wirelessFilters.location || text(job.location) === wirelessFilters.location));
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
  byId("detailMeta").textContent = document.body.dataset.layout === "bold"
    ? (job.deadline ? `Closes ${job.deadline}` : "Open until filled")
    : [job.location, job.type, job.deadline ? `Closes ${job.deadline}` : "Open until filled"].filter(Boolean).join(" • ");
  let postedValue = job.postedAt;
  if (postedValue && typeof postedValue === "object") {
    const seconds = Number(postedValue.seconds ?? postedValue._seconds);
    postedValue = typeof postedValue.toDate === "function"
      ? postedValue.toDate()
      : Number.isFinite(seconds) ? seconds * 1000 : null;
  }
  const postedDate = postedValue ? new Date(postedValue) : null;
  byId("detailPosted").textContent = postedDate && !Number.isNaN(postedDate.getTime())
    ? `Posted ${postedDate.toLocaleDateString("en-ZA", {day: "numeric", month: "short", year: "numeric"})}`
    : "Open position";
  byId("detailSalary").textContent = text(job.salary) || "Negotiable";
  byId("detailFactLocation").textContent = job.location || "Not specified";
  byId("detailFactType").textContent = job.type || "Not specified";
  byId("detailType").textContent = job.type || "Not specified";
  byId("detailLocation").textContent = job.location || "Not specified";
  byId("detailCategory").textContent = job.category || "Not specified";
  byId("detailDeadline").textContent = job.deadline || "Open until filled";
  renderFormattedText(byId("detailDescription"), job.overview || job.description);
  renderDetailSection("detailResponsibilities", "responsibilitiesContent", job.responsibilities);
  renderDetailSection("detailRequirements", "requirementsContent", job.requirements);
  renderCompanySocialLinks();
  const applyLink = byId("applyLink");
  applyLink.hidden = false;
  applyLink.removeAttribute("target");
  applyLink.removeAttribute("rel");
  applyLink.textContent = "Apply Now";
  if (text(job.applicationMethod).toLowerCase() === "external") {
    let destination = null;
    try {
      const parsed = new URL(text(job.applyLink));
      if (parsed.protocol === "http:" || parsed.protocol === "https:") destination = parsed;
    } catch (_) {}
    const host = destination?.hostname.toLowerCase() || "";
    const provider = /(^|\.)linkedin\.com$/.test(host) ? "linkedin" : /(^|\.)indeed\.com$/.test(host) ? "indeed" : "";
    const providerEnabled = !provider || site.applicationOptions?.[provider] !== false;
    if (destination && providerEnabled) {
      applyLink.href = destination.href;
      applyLink.target = "_blank";
      applyLink.rel = "noopener noreferrer";
      applyLink.textContent = provider ? `Apply on ${provider === "linkedin" ? "LinkedIn" : "Indeed"}` : "Continue to application";
    } else {
      applyLink.hidden = true;
    }
  } else {
    applyLink.href = `/apply.html?jobId=${encodeURIComponent(job.id)}&careerSite=1&companyId=${encodeURIComponent(site.companyId)}`;
  }
  history.replaceState({}, "", `/?job=${encodeURIComponent(job.slug || job.id)}`);
  document.body.classList.add("job-detail-open");
}

function applyContentSections() {
  if (!site?.contentSections?.length) return;
  const enabled = new Set(site.contentSections.filter(section => section.enabled !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map(section => section.id));
  const sectionMap = {hero: "about", positions: "jobs", "open-positions": "jobs"};
  Object.entries(sectionMap).forEach(([id, target]) => {
    const element = byId(target);
    if (element) element.hidden = !enabled.has(id) && !enabled.has(target);
  });
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
  const primaryColor = site.brandColors?.primary || "#0d47ff";
  document.documentElement.style.setProperty("--primary", primaryColor);
  document.documentElement.style.setProperty("--wireless-orange", primaryColor);
  document.body.dataset.layout = site.layout || "bold";
  const bannerImage = text(site.media?.bannerImage);
  let bannerImageUrl = "";
  if (bannerImage) {
    try {
      const parsedBanner = new URL(bannerImage, location.href);
      if (parsedBanner.protocol === "http:" || parsedBanner.protocol === "https:") bannerImageUrl = parsedBanner.href;
    } catch (_) {}
  }
  if (bannerImageUrl) {
    document.body.dataset.hasHeroImage = "true";
    document.documentElement.style.setProperty("--hero-image", `url("${bannerImageUrl}")`);
  } else {
    delete document.body.dataset.hasHeroImage;
    document.documentElement.style.removeProperty("--hero-image");
  }
  byId("siteName").textContent = site.displayName; byId("siteHeading").textContent = site.displayName;
  byId("siteTagline").textContent = site.tagline; byId("siteAbout").textContent = site.about;
  byId("siteLogo").src = site.logo || "/android-chrome-192x192.png"; byId("siteLogo").alt = `${site.displayName} logo`;
  byId("contactDetails").textContent = site.contact?.email || "";
  const structuredData = {"@context":"https://schema.org", "@type":"Organization", name:site.displayName, url:location.origin, logo:site.logo || undefined, sameAs:Object.values(site.socialLinks || {}).filter(Boolean)};
  const schema = document.createElement("script"); schema.type = "application/ld+json"; schema.textContent = JSON.stringify(structuredData); document.head.append(schema);
  const jobPostingList = document.createElement("script"); jobPostingList.type = "application/ld+json"; jobPostingList.textContent = JSON.stringify({"@context":"https://schema.org", "@type":"ItemList", itemListElement:jobs.map((job, index) => ({"@type":"ListItem", position:index + 1, url:`${location.origin}/jobs/${encodeURIComponent(job.slug || job.id)}`, name:job.title}))}); document.head.append(jobPostingList);
  applyContentSections(); renderWirelessFilters(); renderJobs();
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
