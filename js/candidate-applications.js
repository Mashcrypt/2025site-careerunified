import {getApp, getApps} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {getAuth, onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const STATUS_COPY = {
  submitted: {
    label: "Submitted",
    message: "Your application was received and is waiting for employer review.",
    progress: 1,
  },
  viewed: {
    label: "Viewed",
    message: "The employer has opened your application.",
    progress: 2,
  },
  shortlisted: {
    label: "Shortlisted",
    message: "The employer moved your application to their shortlist.",
    progress: 3,
  },
  interview: {
    label: "Interview",
    message: "Your application is at the interview stage. Watch your email for employer contact.",
    progress: 3,
  },
  offer: {
    label: "Offer",
    message: "The employer marked this application at offer stage.",
    progress: 4,
  },
  hired: {
    label: "Hired",
    message: "The employer marked this application as hired.",
    progress: 4,
  },
  unsuccessful: {
    label: "Unsuccessful",
    message: "The employer is not progressing this application.",
    progress: 2,
  },
  withdrawn: {
    label: "Withdrawn",
    message: "You withdrew this application.",
    progress: 1,
  },
};

let applications = [];
let messagesByApplication = new Map();
let currentUser = null;
let hasLoaded = false;

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function escapeHtml(value, fallback = "") {
  return safeText(value, fallback)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const date = toDate(value);
  return date
    ? date.toLocaleDateString("en-ZA", {day: "numeric", month: "short", year: "numeric"})
    : "Date unavailable";
}

function statusInfo(status) {
  return STATUS_COPY[status] || STATUS_COPY.submitted;
}

function statusClass(status) {
  if (["shortlisted", "interview", "offer", "hired"].includes(status)) return "progress";
  if (["unsuccessful", "withdrawn"].includes(status)) return "closed";
  return "";
}

function jobUrl(application) {
  const slug = safeText(application.jobSnapshot?.slug);
  return slug ? `/jobs/${encodeURIComponent(slug)}` : "/jobs.html";
}

function applicationMessagesMarkup(applicationId) {
  const messages = (messagesByApplication.get(applicationId) || [])
    .filter(message => message.status === "sent")
    .slice(0, 6);
  if (!messages.length) return "";

  return `
    <section class="candidate-application-messages" aria-label="Messages from the employer">
      <h4>Updates from the employer</h4>
      ${messages.map(message => `
        <details class="candidate-application-message">
          <summary>${escapeHtml(message.subject, "Application update")} <span>${escapeHtml(formatDate(message.sentAt || message.createdAt))}</span></summary>
          <p>${escapeHtml(message.body)}</p>
        </details>`).join("")}
    </section>`;
}

function renderApplications() {
  const list = document.getElementById("candidateApplicationList");
  if (!list) return;

  document.getElementById("candidateApplicationsTotal").textContent = String(applications.length);
  document.getElementById("candidateApplicationsProgress").textContent = String(
    applications.filter(application =>
      ["viewed", "shortlisted", "interview"].includes(application.status)
    ).length,
  );
  document.getElementById("candidateApplicationsOffers").textContent = String(
    applications.filter(application => ["offer", "hired"].includes(application.status)).length,
  );

  if (!applications.length) {
    list.innerHTML = `
      <div class="no-cvs-message">
        <h3>No direct applications yet</h3>
        <p>When a job offers Career Unified Direct Apply, your submitted application will appear here.</p>
        <a class="btn btn-primary" href="/jobs.html" style="margin-top:16px;">Browse Jobs</a>
      </div>`;
    return;
  }

  list.innerHTML = applications.map(application => {
    const job = application.jobSnapshot || {};
    const info = statusInfo(application.status);
    const canWithdraw = !["withdrawn", "unsuccessful", "hired"].includes(application.status);
    return `
      <article class="candidate-application-card">
        <div class="candidate-application-head">
          <div>
            <h3>${escapeHtml(job.title, "Job application")}</h3>
            <p>${escapeHtml(job.company, "Employer")}${job.location ? ` · ${escapeHtml(job.location)}` : ""}</p>
          </div>
          <span class="candidate-status ${statusClass(application.status)}">${escapeHtml(info.label)}</span>
        </div>

        <div class="application-progress" aria-label="Application progress">
          ${[1, 2, 3, 4].map(step => `<span class="${step <= info.progress ? "complete" : ""}"></span>`).join("")}
        </div>

        <p style="color:#374151;font-size:0.9rem;">${escapeHtml(info.message)}</p>
        <div class="candidate-application-meta" style="margin-top:12px;">
          <span>Applied ${escapeHtml(formatDate(application.submittedAt))}</span>
          <span>CV: ${escapeHtml(application.cvSnapshot?.fileName, "Submitted CV")}</span>
        </div>

        ${applicationMessagesMarkup(application.id)}

        <div class="candidate-application-actions">
          <a class="btn btn-primary" href="${escapeHtml(jobUrl(application))}">View Job</a>
          <button class="btn btn-secondary" type="button" data-candidate-cv="${escapeHtml(application.id)}">View submitted CV</button>
          ${canWithdraw ? `<button class="btn btn-secondary" type="button" data-withdraw-application="${escapeHtml(application.id)}">Withdraw</button>` : ""}
        </div>
      </article>`;
  }).join("");
}

async function loadApplications() {
  const list = document.getElementById("candidateApplicationList");
  if (!list || !currentUser) return;
  list.innerHTML = `<p style="color:#6b7280;">Loading your applications...</p>`;

  try {
    const [applicationsResult, messagesResult] = await Promise.allSettled([
      applicationRequest("/.netlify/functions/get-candidate-applications")
        .then(response => response.json()),
      loadCandidateApplicationMessages(),
    ]);
    if (applicationsResult.status !== "fulfilled") throw applicationsResult.reason;

    applications = (Array.isArray(applicationsResult.value?.applications)
      ? applicationsResult.value.applications
      : [])
      .sort((left, right) =>
        (toDate(right.submittedAt)?.getTime() || 0) - (toDate(left.submittedAt)?.getTime() || 0)
      );
    const messages = messagesResult.status === "fulfilled" ? messagesResult.value : [];
    messagesByApplication = new Map();
    messages.forEach(data => {
      if (!data.applicationId || data.status !== "sent") return;
      const messages = messagesByApplication.get(data.applicationId) || [];
      messages.push(data);
      messagesByApplication.set(data.applicationId, messages);
    });
    messagesByApplication.forEach(messages => messages.sort((left, right) =>
      (toDate(right.sentAt || right.createdAt)?.getTime() || 0)
      - (toDate(left.sentAt || left.createdAt)?.getTime() || 0)
    ));
    hasLoaded = true;
    renderApplications();

    if (typeof window.gtag === "function") {
      window.gtag("event", "candidate_applications_view", {
        application_count: applications.length,
      });
    }
  } catch (error) {
    console.error("load candidate applications error:", error);
    list.innerHTML = `<p style="color:#b91c1c;">Your applications could not be loaded. Please refresh and try again.</p>`;
  }
}

async function applicationRequest(path, options = {}) {
  const token = await currentUser.getIdToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Authorization": `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "The application could not be updated.");
  }
  return response;
}

async function loadCandidateApplicationMessages() {
  const response = await applicationRequest("/.netlify/functions/get-application-messages");
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload.messages) ? payload.messages : [];
}

async function openSubmittedCv(applicationId) {
  const previewWindow = window.open("", "_blank");
  try {
    const response = await applicationRequest(
      `/.netlify/functions/download-application-cv?id=${encodeURIComponent(applicationId)}`,
    );
    const blobUrl = URL.createObjectURL(await response.blob());
    if (previewWindow) previewWindow.location.href = blobUrl;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (error) {
    if (previewWindow) previewWindow.close();
    alert(error.message || "The submitted CV could not be opened.");
  }
}

async function withdrawApplication(applicationId) {
  if (!confirm("Withdraw this application? The employer will see that it was withdrawn.")) return;
  try {
    await applicationRequest("/.netlify/functions/update-job-application", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({applicationId, status: "withdrawn"}),
    });
    const application = applications.find(item => item.id === applicationId);
    if (application) application.status = "withdrawn";
    renderApplications();
    if (typeof window.gtag === "function") {
      window.gtag("event", "job_application_withdrawn");
    }
  } catch (error) {
    alert(error.message || "The application could not be withdrawn.");
  }
}

document.addEventListener("click", event => {
  const applicationsTab = event.target.closest('[data-tab="applications"]');
  if (applicationsTab && currentUser && !hasLoaded) loadApplications();

  const cvButton = event.target.closest("[data-candidate-cv]");
  if (cvButton) openSubmittedCv(cvButton.dataset.candidateCv);

  const withdrawButton = event.target.closest("[data-withdraw-application]");
  if (withdrawButton) withdrawApplication(withdrawButton.dataset.withdrawApplication);
});

function openRequestedTab() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") !== "applications") return;
  document.querySelector('[data-tab="applications"]')?.click();
  const notice = document.getElementById("applicationSubmittedNotice");
  if (notice && params.get("submitted") === "1") notice.style.display = "block";
}

function initialise() {
  if (!getApps().length) {
    setTimeout(initialise, 50);
    return;
  }
  const auth = getAuth(getApp());
  onAuthStateChanged(auth, user => {
    currentUser = user;
    if (!user) return;
    openRequestedTab();
    if (document.querySelector('[data-tab="applications"]')?.classList.contains("active") && !hasLoaded) {
      loadApplications();
    }
  });
}

initialise();
