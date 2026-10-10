const byId = id => document.getElementById(id);
const text = value => String(value || "").trim();
let site = null;
let jobs = [];
let candidateUser = null;
let savedJobIds = new Set();
let savedJobsUnsubscribe = null;
let wirelessFilters = {category: "", location: "", type: ""};
let editorialRefineTerms = [];

function updateSplitBookmarkButtons() {
  document.querySelectorAll("[data-saved-job-id]").forEach(button => {
    const saved = savedJobIds.has(button.dataset.savedJobId);
    button.setAttribute("aria-pressed", String(saved));
  });
}

function loadCandidateSavedJobs(user) {
  if (savedJobsUnsubscribe) {
    savedJobsUnsubscribe();
    savedJobsUnsubscribe = null;
  }
  candidateUser = user || null;
  savedJobIds = new Set();
  if (candidateUser) {
    savedJobsUnsubscribe = firebase.firestore().collection("users").doc(candidateUser.uid).collection("saved").where("type", "==", "job").onSnapshot(snapshot => {
      savedJobIds = new Set();
      snapshot.forEach(doc => {
        const jobId = doc.id.startsWith("job_") ? doc.id.slice(4) : "";
        if (jobId) savedJobIds.add(jobId);
      });
      updateSplitBookmarkButtons();
    }, error => {
      console.error("Could not load saved career site jobs:", error);
    });
  }
  updateSplitBookmarkButtons();
}

async function toggleCareerSiteJobBookmark(job, button) {
  const host = location.hostname.toLowerCase();
  const isLocalTenantHost = host.endsWith(".localhost");
  const accountOrigin = isLocalTenantHost
    ? `${location.protocol}//localhost:${location.port}`
    : host === "localhost" || host.startsWith("127.") ? location.origin : "https://careerunified.com";

  // Recruiter career sites often run on a separate subdomain or custom domain.
  // Firebase Auth storage is origin scoped, so use the main Career Unified
  // origin for these saves and let Saved Items persist them under its session.
  if (!candidateUser || location.origin !== accountOrigin) {
    const params = new URLSearchParams({
      saveJob: job.id,
      title: job.title || "Open position",
      company: site.displayName || "",
      location: job.location || "",
      salary: job.salary || "",
      deadline: job.deadline || "",
      applyLink: text(job.applicationMethod).toLowerCase() === "external" ? job.applyLink || "" : `${location.origin}/apply.html?jobId=${encodeURIComponent(job.id)}&careerSite=1&companyId=${encodeURIComponent(site.companyId)}`,
      slug: job.slug || "",
      returnTo: location.href
    });
    location.href = `${accountOrigin}/saved-items.html?${params.toString()}`;
    return;
  }
  const docId = `job_${job.id}`;
  const savedRef = firebase.firestore().collection("users").doc(candidateUser.uid).collection("saved").doc(docId);
  button.disabled = true;
  try {
    if (savedJobIds.has(job.id)) {
      await savedRef.delete();
      savedJobIds.delete(job.id);
    } else {
      const applyUrl = text(job.applicationMethod).toLowerCase() === "external" && job.applyLink
        ? job.applyLink
        : `${location.origin}/apply.html?jobId=${encodeURIComponent(job.id)}&careerSite=1&companyId=${encodeURIComponent(site.companyId)}`;
      await savedRef.set({
        type: "job",
        title: job.title || "Open position",
        company: site.displayName || null,
        deadline: job.deadline || null,
        deadlineDate: job.deadline || null,
        location: job.location || null,
        salary: job.salary || null,
        applyLink: applyUrl,
        slug: job.slug || null,
        savedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      savedJobIds.add(job.id);
    }
    updateSplitBookmarkButtons();
  } catch (error) {
    console.error("Could not save career site job:", error);
    alert("Could not update Saved Items. Please try again.");
  } finally {
    button.disabled = false;
  }
}

function renderWirelessFilters() {
  const aside = byId("wirelessFilters");
  if (!aside) return;
  aside.replaceChildren();
  const isEditorial = document.body.dataset.layout === "editorial";
  aside.hidden = !isEditorial && document.body.dataset.layout !== "wireless";
  if (aside.hidden) return;
  const heading = document.createElement("h3");
  heading.className = "wireless-filters-title";
  heading.textContent = isEditorial ? "Refine by Keyword" : "Filter open positions";
  aside.append(heading);
  if (isEditorial) {
    const refine = document.createElement("div");
    refine.className = "editorial-refine-keyword";
    const input = document.createElement("input");
    input.type = "search";
    input.id = "editorialRefineInput";
    input.placeholder = "Finance, risk, hybrid, etc.";
    input.setAttribute("aria-label", "Refine results by keyword");
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add";
    const terms = document.createElement("div");
    terms.className = "editorial-refine-terms";
    const addTerm = () => {
      const term = text(input.value);
      if (!term || editorialRefineTerms.some(value => value.toLowerCase() === term.toLowerCase())) return;
      editorialRefineTerms.push(term);
      renderWirelessFilters();
      renderJobs();
    };
    add.addEventListener("click", addTerm);
    input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addTerm(); } });
    editorialRefineTerms.forEach(term => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "editorial-refine-chip";
      chip.textContent = `${term} ×`;
      chip.setAttribute("aria-label", `Remove keyword ${term}`);
      chip.addEventListener("click", () => { editorialRefineTerms = editorialRefineTerms.filter(value => value !== term); renderWirelessFilters(); renderJobs(); });
      terms.append(chip);
    });
    refine.append(input, add, terms);
    aside.append(refine);
  }
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
  if (isEditorial) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "editorial-clear-filters";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => {
      wirelessFilters = {category: "", location: "", type: ""};
      editorialRefineTerms = [];
      byId("editorialKeyword").value = "";
      byId("editorialLocation").value = "";
      renderWirelessFilters();
      renderJobs();
    });
    aside.append(clear);
  }
}

function renderJobs() {
  const isEditorial = document.body.dataset.layout === "editorial";
  const query = text(isEditorial ? byId("editorialKeyword")?.value : byId("jobSearch")?.value).toLowerCase();
  const locationQuery = text(isEditorial ? byId("editorialLocation")?.value : "").toLowerCase();
  const visible = jobs.filter(job => {
    const searchable = [job.title, job.location, job.type, job.category, job.description, job.overview].join(" ").toLowerCase();
    return searchable.includes(query)
    && text(job.location).toLowerCase().includes(locationQuery)
    && editorialRefineTerms.every(term => searchable.includes(term.toLowerCase()))
    && (!wirelessFilters.category || text(job.category) === wirelessFilters.category)
    && (!wirelessFilters.location || text(job.location) === wirelessFilters.location)
    && (!wirelessFilters.type || text(job.type) === wirelessFilters.type);
  });
  if (isEditorial) {
    const sort = byId("editorialSort")?.value || "date";
    visible.sort((a, b) => {
      if (sort === "title") return text(a.title).localeCompare(text(b.title));
      if (sort === "location") return text(a.location).localeCompare(text(b.location));
      const dateValue = value => {
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
      };
      return dateValue(b.postedAt) - dateValue(a.postedAt);
    });
    byId("editorialResultCount").textContent = `${visible.length} ${visible.length === 1 ? "Result" : "Results"}`;
  }
  const list = byId("jobList");
  list.replaceChildren();
  if (!visible.length) { const empty = document.createElement("p"); empty.className = "state"; empty.textContent = query || locationQuery || editorialRefineTerms.length || wirelessFilters.category || wirelessFilters.location || wirelessFilters.type ? "No open positions match your search." : "There are no open positions right now."; list.append(empty); return; }
  visible.forEach(job => {
    const card = document.createElement("a"); card.className = `job-card${isEditorial ? " editorial-job-card" : ""}`; card.href = `/?job=${encodeURIComponent(job.slug || job.id)}`;
    if (isEditorial && job.type) { const mode = document.createElement("p"); mode.className = "editorial-job-mode"; mode.textContent = job.type; card.append(mode); }
    const title = document.createElement("h3"); title.textContent = job.title; card.append(title);
    const meta = document.createElement("p"); meta.className = "job-meta"; meta.textContent = isEditorial ? [job.location, job.deadline ? `Closes ${job.deadline}` : ""].filter(Boolean).join(" • ") : [job.location, job.type, job.deadline ? `Closes ${job.deadline}` : "Open until filled"].filter(Boolean).join(" • "); card.append(meta);
    const tags = document.createElement("div"); tags.className = "tags"; [job.category, job.type].filter(Boolean).forEach(value => { const tag = document.createElement("span"); tag.textContent = value; tags.append(tag); }); card.append(tags); list.append(card);
  });
}

function renderDetailFactIcons() {
  if (!["bold", "clean", "wireless"].includes(document.body.dataset.layout)) return;
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icons = [
    [
      ["rect", {x: "3", y: "6", width: "18", height: "12", rx: "2"}],
      ["circle", {cx: "12", cy: "12", r: "3"}],
      ["path", {d: "M7 9h.01M17 15h.01"}]
    ],
    [
      ["path", {d: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"}],
      ["circle", {cx: "12", cy: "10", r: "2.5"}]
    ],
    [
      ["rect", {x: "3", y: "7", width: "18", height: "14", rx: "2"}],
      ["path", {d: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"}]
    ]
  ];
  document.querySelectorAll(".editorial-detail-facts > div > span").forEach((container, index) => {
    const icon = document.createElementNS(svgNamespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    icons[index]?.forEach(([tag, attributes]) => {
      const shape = document.createElementNS(svgNamespace, tag);
      Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, value));
      icon.append(shape);
    });
    container.replaceChildren(icon);
  });
}

function renderDetail(job) {
  byId("jobDetail").hidden = false;
  byId("jobDetail").setAttribute("aria-modal", String(document.body.dataset.layout !== "editorial"));
  byId("companySocialLinksOpenings").hidden = true;
  const isBoldLayout = document.body.dataset.layout === "bold";
  const isEditorialLayout = document.body.dataset.layout === "editorial";
  const postedDateLabel = byId("detailPosted");
  const closingDateLabel = byId("detailClosingDate");
  const dateStack = document.querySelector(".detail-date-stack");
  const postedBrand = document.querySelector(".detail-posted-brand");
  (isBoldLayout || isEditorialLayout ? dateStack : postedBrand).insertBefore(postedDateLabel, isBoldLayout || isEditorialLayout ? closingDateLabel : null);
  closingDateLabel.hidden = !isBoldLayout && !isEditorialLayout;
  if (isEditorialLayout) byId("jobDetailMain").insertBefore(dateStack, byId("detailSummary"));
  renderDetailFactIcons();
  renderSplitRelatedJobs(job);
  byId("detailTitle").textContent = job.title;
  const detailSummary = text(job.summary || job.shortDescription || job.tagline);
  byId("detailSummary").textContent = detailSummary.length > 240 ? `${detailSummary.slice(0, 237).trimEnd()}…` : detailSummary;
  byId("detailSummary").hidden = !detailSummary;
  byId("detailDescriptionHeading").textContent = "About the role";
  if (document.body.dataset.layout === "clean") {
    const requirementsHeading = byId("detailRequirements").querySelector("h3");
    if (requirementsHeading) requirementsHeading.textContent = "What you need";
  } else if (document.body.dataset.layout === "split") {
    byId("detailDescriptionHeading").textContent = "About this role";
    const requirementsHeading = byId("detailRequirements").querySelector("h3");
    if (requirementsHeading) requirementsHeading.textContent = "Qualification";
  }
  byId("detailMeta").textContent = isEditorialLayout
    ? `Job Location: ${job.location || "South Africa"}`
    : document.body.dataset.layout === "bold"
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
    ? `${isEditorialLayout ? "Posting Start Date: " : "Posted "}${postedDate.toLocaleDateString("en-ZA", {day: "2-digit", month: "2-digit", year: "numeric"})}`
    : isEditorialLayout ? "Posting Start Date: Not specified" : "Open position";
  byId("detailClosingDate").textContent = job.deadline ? `Closes ${job.deadline}` : "Open until filled";
  byId("detailSalary").textContent = text(job.salary) || "Negotiable";
  byId("detailFactLocation").textContent = job.location || "Not specified";
  byId("detailFactType").textContent = job.type || "Not specified";
  [
    ["detailType", job.type || "Not specified"],
    ["detailLocation", job.location || "Not specified"],
    ["detailCategory", job.category || "Not specified"],
    ["detailDeadline", job.deadline || "Open until filled"]
  ].forEach(([id, value]) => {
    const element = byId(id);
    if (element) element.textContent = value;
  });
  renderFormattedText(byId("detailDescription"), isEditorialLayout ? job.description || job.overview : job.overview || job.description);
  renderDetailSection("detailResponsibilities", "responsibilitiesContent", job.responsibilities);
  renderDetailSection("detailRequirements", "requirementsContent", job.requirements);
  renderCareerVideoGallery(byId("detailMedia"), site.media?.showOnDetails === false ? [] : getCareerSiteVideoUrls());
  renderCompanySocialLinks("companySocialLinks", isEditorialLayout
    ? site.media?.showOnOpenings !== false
    : site.media?.showOnDetails !== false);
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
  const bottomApplyLink = byId("applyLinkBottom");
  bottomApplyLink.hidden = !isEditorialLayout || applyLink.hidden;
  bottomApplyLink.href = applyLink.href;
  bottomApplyLink.textContent = applyLink.textContent;
  bottomApplyLink.removeAttribute("target");
  bottomApplyLink.removeAttribute("rel");
  if (applyLink.target) bottomApplyLink.target = applyLink.target;
  if (applyLink.rel) bottomApplyLink.rel = applyLink.rel;
  const wirelessApplyLink = byId("applyLinkWireless");
  wirelessApplyLink.hidden = document.body.dataset.layout !== "wireless" || applyLink.hidden;
  wirelessApplyLink.href = applyLink.href;
  wirelessApplyLink.textContent = applyLink.textContent;
  wirelessApplyLink.removeAttribute("target");
  wirelessApplyLink.removeAttribute("rel");
  if (applyLink.target) wirelessApplyLink.target = applyLink.target;
  if (applyLink.rel) wirelessApplyLink.rel = applyLink.rel;
  const saveButton = byId("splitSaveJob");
  saveButton.dataset.savedJobId = job.id;
  saveButton.setAttribute("aria-pressed", String(savedJobIds.has(job.id)));
  saveButton.onclick = () => toggleCareerSiteJobBookmark(job, saveButton);
  byId("splitShareJob").onclick = async () => {
    const shareUrl = `${location.origin}/?job=${encodeURIComponent(job.slug || job.id)}`;
    if (navigator.share) {
      try { await navigator.share({title: job.title, url: shareUrl}); } catch (_) {}
    } else if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(shareUrl); } catch (_) {}
    }
  };
  history.replaceState({}, "", `/?job=${encodeURIComponent(job.slug || job.id)}`);
  document.body.classList.add("job-detail-open");
}

function renderSplitRelatedJobs(currentJob) {
  const sidebar = byId("splitDetailSidebar");
  const similarList = byId("splitSimilarJobs");
  const companyList = byId("splitCompanyJobs");
  if (!sidebar || !similarList || !companyList) return;
  const available = jobs.filter(job => job.id !== currentJob.id && (job.slug || job.title));
  const similar = available.filter(job =>
    (currentJob.category && text(job.category).toLowerCase() === text(currentJob.category).toLowerCase()) ||
    (currentJob.type && text(job.type).toLowerCase() === text(currentJob.type).toLowerCase())
  ).slice(0, 3);
  const similarIds = new Set(similar.map(job => job.id));
  const otherCompanyJobs = available.filter(job => !similarIds.has(job.id)).slice(0, 3);
  const postedAgeLabel = value => {
    let postedValue = value;
    if (postedValue && typeof postedValue === "object") {
      const seconds = Number(postedValue.seconds ?? postedValue._seconds);
      postedValue = typeof postedValue.toDate === "function" ? postedValue.toDate() : Number.isFinite(seconds) ? seconds * 1000 : null;
    }
    const postedAt = postedValue ? new Date(postedValue) : null;
    if (!postedAt || Number.isNaN(postedAt.getTime())) return "Recently posted";
    const days = Math.max(0, Math.floor((Date.now() - postedAt.getTime()) / 86400000));
    if (days === 0) return "Today";
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };
  const bookmarkIcon = () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M6 3.75A1.75 1.75 0 0 1 7.75 2h8.5A1.75 1.75 0 0 1 18 3.75V22l-6-4-6 4V3.75Z");
    svg.append(path);
    return svg;
  };
  const createCards = (container, entries) => {
    container.replaceChildren();
    entries.forEach(job => {
      const card = document.createElement("article");
      card.className = "split-related-card";
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "split-related-open";
      const title = document.createElement("strong");
      title.textContent = job.title || "Open position";
      const company = document.createElement("span");
      company.className = "split-related-company";
      company.textContent = [site.displayName, job.location].filter(Boolean).join(" • ");
      const tags = document.createElement("span");
      tags.className = "split-related-tags";
      [job.type, job.category].filter(Boolean).forEach(value => {
        const tag = document.createElement("small");
        tag.textContent = value;
        tags.append(tag);
      });
      const posted = document.createElement("span");
      posted.className = "split-related-posted";
      posted.textContent = `${postedAgeLabel(job.postedAt)}${job.applicantCount ? ` • ${job.applicantCount} Applicants` : ""}`;
      openButton.append(title, company, tags, posted);
      openButton.addEventListener("click", () => renderDetail(job));
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "split-related-save";
      saveButton.setAttribute("aria-label", "Save job");
      saveButton.title = "Save job";
      saveButton.dataset.savedJobId = job.id;
      saveButton.setAttribute("aria-pressed", String(savedJobIds.has(job.id)));
      saveButton.append(bookmarkIcon());
      saveButton.addEventListener("click", () => toggleCareerSiteJobBookmark(job, saveButton));
      card.append(openButton, saveButton);
      container.append(card);
    });
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "split-related-empty";
      empty.textContent = "No other openings right now.";
      container.append(empty);
    }
  };
  createCards(similarList, similar);
  createCards(companyList, otherCompanyJobs);
  sidebar.hidden = document.body.dataset.layout !== "split";
  const companyHeading = byId("splitCompanyJobsHeading");
  if (companyHeading) companyHeading.textContent = `Other Jobs From ${site.displayName || "This Company"}`;
}

function safePublicMediaUrl(value) {
  try {
    const parsed = new URL(text(value), location.href);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
  } catch (_) { return ""; }
}

function careerVideoEmbedUrl(platform, value) {
  let parsed;
  try { parsed = new URL(text(value)); } catch (_) { return ""; }
  if (!["https:", "http:"].includes(parsed.protocol)) return "";
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (platform === "youtube") {
    if (!new Set(["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"]).has(host)) return "";
    const parts = parsed.pathname.split("/").filter(Boolean);
    const id = host === "youtu.be" ? parts[0] : parsed.searchParams.get("v") || (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" ? parts[1] : "");
    return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? `https://www.youtube-nocookie.com/embed/${id}` : "";
  }
  if (platform === "vimeo") {
    if (!new Set(["vimeo.com", "player.vimeo.com"]).has(host)) return "";
    const parts = parsed.pathname.split("/").filter(Boolean);
    const videoIndex = parts[0] === "video" ? 1 : 0;
    const id = parts[videoIndex] || "";
    if (!/^\d{1,20}$/.test(id)) return "";
    const privacyHash = parsed.searchParams.get("h") || (parts[videoIndex + 1] || "");
    return `https://player.vimeo.com/video/${id}${/^[A-Za-z0-9]{6,40}$/.test(privacyHash) ? `?h=${encodeURIComponent(privacyHash)}` : ""}`;
  }
  return "";
}

function getCareerSiteVideoUrls() {
  return [
    ["youtube", "YouTube", site.media?.youtube],
    ["vimeo", "Vimeo", site.media?.vimeo]
  ].map(([platform, label, url]) => ({platform, label, url: careerVideoEmbedUrl(platform, url)})).filter(video => video.url);
}

function renderCareerVideoGallery(container, videos) {
  if (!container) return false;
  const grid = container.querySelector(".career-video-grid");
  grid.replaceChildren();
  videos.forEach(video => {
    const frame = document.createElement("iframe");
    frame.src = video.url;
    frame.title = `${site.displayName} ${video.label} video`;
    frame.loading = "lazy";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    const wrapper = document.createElement("div");
    wrapper.className = "career-video-frame";
    wrapper.append(frame);
    grid.append(wrapper);
  });
  container.hidden = videos.length === 0;
  return videos.length > 0;
}

function renderCareerSiteMedia() {
  const showcase = byId("careerSiteMediaShowcase");
  const imageGallery = byId("careerSiteImageGallery");
  if (!showcase || !imageGallery) return;
  const grid = imageGallery.querySelector(".career-image-grid");
  grid.replaceChildren();
  const images = (Array.isArray(site.media?.images) ? site.media.images : []).map(safePublicMediaUrl).filter(Boolean).slice(0, 20);
  images.forEach((url, index) => {
    const image = document.createElement("img");
    image.src = url;
    image.alt = `${site.displayName} workplace photo ${index + 1}`;
    image.loading = "lazy";
    grid.append(image);
  });
  imageGallery.querySelector(".career-media-heading").textContent = `Life at ${site.displayName}`;
  imageGallery.hidden = images.length === 0;
  showcase.hidden = images.length === 0;
  const showOpeningVideos = site.media?.showOnOpenings !== false;
  renderCareerVideoGallery(byId("careerSiteOpeningVideos"), showOpeningVideos ? getCareerSiteVideoUrls() : []);
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

function renderCompanySocialLinks(containerId = "companySocialLinks", enabled = true) {
  const container = byId(containerId);
  if (!container) return;
  container.replaceChildren();
  if (!enabled) { container.hidden = true; return; }
  const links = [
    ["linkedin", "LinkedIn"], ["twitter", "X"],
    ["instagram", "Instagram"], ["facebook", "Facebook"]
  ].filter(([key]) => /^https:\/\//i.test(text(site.socialLinks?.[key])));
  if (!links.length) { container.hidden = true; return; }
  container.hidden = false;
  const label = document.createElement("span"); label.className = "company-social-label"; label.textContent = "Follow this employer"; container.append(label);
  const icons = {
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0h.01z"/></svg>',
    twitter: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.63 7.58H.48l8.6-9.83L0 1.15h7.59l5.24 6.93zm-1.29 19.49h2.04L6.49 3.24H4.3z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="social-icon-dot" cx="17.5" cy="6.5" r="1"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11 10.13 11.87v-8.4H7.08v-3.47h3.05V9.42c0-3.03 1.79-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.95.93-1.95 1.88v2.27h3.32l-.53 3.47h-2.79v8.4C19.61 23.07 24 18.09 24 12.07z"/></svg>'
  };
  links.forEach(([key, name]) => {
    const link = document.createElement("a");
    link.href = site.socialLinks[key];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = `company-social-link company-social-${key}`;
    link.title = `Follow on ${name}`;
    link.setAttribute("aria-label", `Follow on ${name}`);
    link.innerHTML = icons[key];
    container.append(link);
  });
}

function closeDetail() {
  byId("jobDetail").hidden = true;
  renderCompanySocialLinks("companySocialLinksOpenings", site.media?.showOnOpenings !== false);
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
    const editorialHeading = document.body.dataset.layout === "editorial"
      && line.length <= 110
      && (!/[.!]$/.test(line) || /\?$/.test(line))
      && (line.split(/\s+/).length <= 13 || /:$/.test(line));
    if (editorialHeading) {
      const heading = document.createElement("h3");
      heading.textContent = line.replace(/:$/, "");
      container.append(heading);
      return;
    }
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
  const secondaryColor = site.brandColors?.secondary || primaryColor;
  document.documentElement.style.setProperty("--primary", primaryColor);
  document.documentElement.style.setProperty("--secondary", secondaryColor);
  document.documentElement.style.setProperty("--wireless-orange", primaryColor);
  document.body.dataset.layout = site.layout || "bold";
  if (document.body.dataset.layout === "clean") {
    byId("jobDetail").querySelector(".job-detail-sidebar")?.remove();
  }
  if (["bold", "wireless"].includes(document.body.dataset.layout)) {
    byId("jobDetail").querySelector(".editorial-detail-tabs span:nth-child(2)")?.remove();
  }
  const bannerImage = text(site.media?.bannerImage || site.media?.images?.[0]);
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
  renderCareerSiteMedia();
  const detailBanner = byId("detailBanner");
  if (detailBanner && bannerImageUrl) detailBanner.style.setProperty("--detail-banner-image", `url("${bannerImageUrl}")`);
  else if (detailBanner) detailBanner.style.removeProperty("--detail-banner-image");
  const openingSocialLinks = byId("companySocialLinksOpenings");
  renderCompanySocialLinks("companySocialLinksOpenings", site.media?.showOnOpenings !== false);
  if (["wireless", "editorial"].includes(document.body.dataset.layout) && openingSocialLinks) {
    const footer = document.querySelector("footer");
    const footerPowered = footer?.querySelector(".footer-powered");
    if (footer) footer.insertBefore(openingSocialLinks, footerPowered || null);
  }
  byId("siteName").textContent = site.displayName; byId("siteHeading").textContent = site.displayName;
  byId("siteTagline").textContent = site.tagline; byId("siteAbout").textContent = site.about;
  if (site.layout === "editorial") {
    byId("siteHeading").textContent = "Search Jobs";
    byId("introSearchButton").firstChild.nodeValue = "Search Jobs ";
    byId("introSearchButton").href = "#editorialSearch";
    byId("editorialSearch").hidden = false;
    byId("editorialResultsBar").hidden = false;
  }
  const aboutUrl = text(site.aboutUrl);
  try {
    const parsedAboutUrl = new URL(aboutUrl);
    byId("siteAboutLink").href = ["http:", "https:"].includes(parsedAboutUrl.protocol) ? parsedAboutUrl.href : "#about";
  } catch (_) {
    byId("siteAboutLink").href = "#about";
  }
  byId("siteLogo").src = site.logo || "/android-chrome-192x192.png"; byId("siteLogo").alt = `${site.displayName} logo`;
  document.body.dataset.hasCompanyLogo = site.logo ? "true" : "false";
  byId("detailCompanyLogo").src = site.logo || "/android-chrome-192x192.png";
  byId("detailCompanyLogo").alt = `${site.displayName} logo`;
  byId("detailCompanyLogo").hidden = !["clean", "bold", "split"].includes(document.body.dataset.layout);
  const contactDetails = byId("contactDetails");
  const omitFooterEmail = ["bold", "clean", "wireless", "editorial"].includes(document.body.dataset.layout);
  if (omitFooterEmail) contactDetails.remove();
  else contactDetails.textContent = site.contact?.email || "";
  const structuredData = {"@context":"https://schema.org", "@type":"Organization", name:site.displayName, url:location.origin, logo:site.logo || undefined, sameAs:Object.values(site.socialLinks || {}).filter(Boolean)};
  const schema = document.createElement("script"); schema.type = "application/ld+json"; schema.textContent = JSON.stringify(structuredData); document.head.append(schema);
  const jobPostingList = document.createElement("script"); jobPostingList.type = "application/ld+json"; jobPostingList.textContent = JSON.stringify({"@context":"https://schema.org", "@type":"ItemList", itemListElement:jobs.map((job, index) => ({"@type":"ListItem", position:index + 1, url:`${location.origin}/jobs/${encodeURIComponent(job.slug || job.id)}`, name:job.title}))}); document.head.append(jobPostingList);
  applyContentSections(); renderWirelessFilters(); renderJobs();
  const pathJob = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const requestedJob = new URLSearchParams(location.search).get("job") || "";
  const selected = jobs.find(job => job.slug === (requestedJob || pathJob) || job.id === (requestedJob || pathJob));
  if (selected) renderDetail(selected);
  document.body.dataset.siteState = "ready";
  document.body.setAttribute("aria-busy", "false");
}

byId("jobSearch")?.addEventListener("input", renderJobs);
byId("editorialKeyword")?.addEventListener("input", renderJobs);
byId("editorialLocation")?.addEventListener("input", renderJobs);
byId("editorialSearchButton")?.addEventListener("click", () => {
  renderJobs();
  byId("jobs").scrollIntoView({behavior:"smooth", block:"start"});
});
byId("editorialSort")?.addEventListener("change", renderJobs);
document.querySelector('.site-nav a[href="#jobs"]')?.addEventListener("click", event => {
  if (document.body.dataset.layout === "editorial" && document.body.classList.contains("job-detail-open")) {
    event.preventDefault();
    closeDetail();
  }
});
byId("backToJobs")?.addEventListener("click", closeDetail);
byId("backToJobsBanner")?.addEventListener("click", closeDetail);
byId("jobDetail")?.addEventListener("click", event => { if (event.target === event.currentTarget) closeDetail(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !byId("jobDetail")?.hidden) closeDetail(); });
if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(user => { void loadCandidateSavedJobs(user); });
}
const careerSiteLoadError = byId("careerSiteLoadError");
function showCareerSiteLoadError(error) {
  console.error("Could not load the recruiter career site:", error);
  careerSiteLoadError.hidden = false;
  document.body.dataset.siteState = "error";
  document.body.setAttribute("aria-busy", "false");
}
byId("retryCareerSiteLoad").addEventListener("click", () => {
  careerSiteLoadError.hidden = true;
  document.body.dataset.siteState = "loading";
  document.body.setAttribute("aria-busy", "true");
  loadCareerSite().catch(showCareerSiteLoadError);
});
loadCareerSite().catch(showCareerSiteLoadError);
