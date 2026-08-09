(function () {
  "use strict";

  const featureContent = {
    "ai-matching": {
      headline: "Surface your best-matched candidates in seconds, not days",
      body: "Career Unified AI compares each application with your role requirements and highlights the strongest evidence, helping your team build a focused shortlist while keeping every hiring decision in human hands.",
      bullets: [
        "Match skills, experience, qualifications, and role requirements",
        "Clear signals explaining why each candidate is relevant",
        "Recruiter-controlled shortlists with no automatic rejection"
      ],
      image: "/assets/images/recruiter-team.webp",
      alt: "South African recruiters reviewing AI-matched candidates"
    },
    applications: {
      headline: "Review the whole application, not just a filename",
      body: "Open the candidate profile, submitted CV, screening answers, and essential-criteria signals together before deciding who should move forward.",
      bullets: [
        "Profile, CV, and job-specific answers in one view",
        "Clear application status for candidates and recruiters",
        "Secure submitted-CV access for the vacancy team"
      ],
      image: "/assets/images/recruiter-platform.webp",
      alt: "Career Unified recruiter workspace showing applications and a hiring pipeline"
    },
    pipeline: {
      headline: "Keep every candidate moving through a visible pipeline",
      body: "Open a job-specific workspace and move applications from submitted to shortlist, interview, offer, hired, or closed without losing the context behind the decision.",
      bullets: [
        "Six clear application stages for each vacancy",
        "Status changes reflected in the candidate's application view",
        "Private notes remain attached to the application"
      ],
      image: "/assets/images/recruiter-platform.webp",
      alt: "Career Unified hiring pipeline with candidates organised by stage"
    },
    analytics: {
      headline: "See which vacancies and applications need attention",
      body: "Use recruiter inbox counts and vacancy-level activity to understand where applications are waiting, which interviews are active, and what your team should open next.",
      bullets: [
        "Application and interview activity at a glance",
        "Vacancy-level totals and progress signals",
        "A focused view of work that needs recruiter action"
      ],
      image: "/assets/images/recruiter-platform.webp",
      alt: "Career Unified recruiter analytics and vacancy activity illustration"
    },
    screening: {
      headline: "Ask the questions that matter for this specific role",
      body: "Add concise screening questions to Direct Apply vacancies and mark essential criteria so reviewers can prioritise evidence without silently auto-rejecting applicants.",
      bullets: [
        "Add up to eight job-specific questions",
        "Use reusable question templates for common checks",
        "Keep recruiter judgement at the centre of every decision"
      ],
      image: "/assets/images/recruiter-team.webp",
      alt: "Recruiters discussing candidate screening evidence"
    },
    collaboration: {
      headline: "Keep vacancy decisions understandable to your team",
      body: "Review the same candidate evidence, add private notes, update stages, and use direct contact actions from the workspace so follow-up does not disappear into separate tools.",
      bullets: [
        "Private recruiter notes on each application",
        "Shared vacancy stages for consistent review",
        "Direct candidate follow-up when your team is ready"
      ],
      image: "/assets/images/recruiter-team.webp",
      alt: "South African hiring team collaborating on candidate decisions"
    }
  };

  const nav = document.querySelector("[data-recruiter-nav]");
  const mobileToggle = document.querySelector(".hf-nav__toggle");
  const mobileNav = document.getElementById("recruiterMobileNav");
  const dropdownItems = Array.from(document.querySelectorAll(".hf-nav__item"));

  function setMobileMenu(open) {
    if (!mobileToggle || !mobileNav) return;
    mobileToggle.setAttribute("aria-expanded", String(open));
    mobileToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    mobileToggle.innerHTML = open
      ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    mobileNav.hidden = !open;
    document.body.classList.toggle("menu-open", open);
  }

  function closeDropdowns(except) {
    dropdownItems.forEach((item) => {
      if (item === except) return;
      item.classList.remove("is-open");
      item.querySelector(".hf-nav__trigger")?.setAttribute("aria-expanded", "false");
    });
  }

  mobileToggle?.addEventListener("click", () => {
    setMobileMenu(mobileToggle.getAttribute("aria-expanded") !== "true");
  });

  mobileNav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMobileMenu(false));
  });

  dropdownItems.forEach((item) => {
    const trigger = item.querySelector(".hf-nav__trigger");
    if (!trigger) return;

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = !item.classList.contains("is-open");
      closeDropdowns(item);
      item.classList.toggle("is-open", open);
      trigger.setAttribute("aria-expanded", String(open));
    });

    item.addEventListener("mouseenter", () => {
      if (!window.matchMedia("(min-width: 1121px)").matches) return;
      closeDropdowns(item);
      item.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    });

    item.addEventListener("mouseleave", () => {
      if (!window.matchMedia("(min-width: 1121px)").matches) return;
      item.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", () => closeDropdowns());
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeDropdowns();
    setMobileMenu(false);
  });

  window.addEventListener("scroll", () => {
    nav?.classList.toggle("is-scrolled", window.scrollY > 20);
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1120 && mobileToggle?.getAttribute("aria-expanded") === "true") {
      setMobileMenu(false);
    }
  });

  const tabButtons = Array.from(document.querySelectorAll("[data-feature-tab]"));
  const panel = document.getElementById("recruiterFeaturePanel");
  const headline = panel?.querySelector("[data-feature-headline]");
  const body = panel?.querySelector("[data-feature-body]");
  const bulletList = panel?.querySelector("[data-feature-bullets]");
  const featureImage = panel?.querySelector("[data-feature-image]");

  function selectFeature(key, track) {
    const content = featureContent[key];
    if (!content || !panel || !headline || !body || !bulletList || !featureImage) return;

    tabButtons.forEach((button) => {
      const selected = button.dataset.featureTab === key;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected) panel.setAttribute("aria-labelledby", button.id);
    });

    headline.textContent = content.headline;
    body.textContent = content.body;
    bulletList.replaceChildren(...content.bullets.map((text) => {
      const item = document.createElement("li");
      const icon = document.createElement("span");
      icon.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
      item.append(icon, document.createTextNode(text));
      return item;
    }));

    featureImage.classList.add("is-changing");
    window.setTimeout(() => {
      featureImage.src = content.image;
      featureImage.alt = content.alt;
      featureImage.classList.remove("is-changing");
    }, 90);

    if (track && typeof window.gtag === "function") {
      window.gtag("event", "recruiter_feature_tab", { feature_name: key });
    }
  }

  tabButtons.forEach((button, index) => {
    button.id = `recruiterFeatureTab-${button.dataset.featureTab}`;
    button.tabIndex = index === 0 ? 0 : -1;
    button.addEventListener("click", () => selectFeature(button.dataset.featureTab, true));
    button.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabButtons[(index + direction + tabButtons.length) % tabButtons.length];
      next.focus();
      selectFeature(next.dataset.featureTab, true);
    });
  });

  if (tabButtons[0]) panel?.setAttribute("aria-labelledby", tabButtons[0].id);

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-cro-event]");
    if (!target || typeof window.gtag !== "function") return;
    window.gtag("event", target.dataset.croEvent, {
      page_location: window.location.href,
      link_url: target.href || ""
    });
  });
})();
