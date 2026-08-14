import {getApp, getApps, initializeApp} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {getAuth, getIdToken, onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAEBbnXPlYYf9jbfgLSzfod3r0i5MOAo9M",
  authDomain: "career-unified.firebaseapp.com",
  projectId: "career-unified",
  storageBucket: "career-unified.firebasestorage.app",
  messagingSenderId: "101656817742",
  appId: "1:101656817742:web:22c9a58a822a714e54931f",
  measurementId: "G-2Z934XRVXT",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const panel = document.getElementById("applicationPanel");
const summary = document.getElementById("jobSummary");
const jobId = new URLSearchParams(window.location.search).get("job") || "";
const APPLICATION_CONFIRMATION_KEY = "careerUnifiedDirectApplyConfirmation";
let currentJob = null;
let currentUser = null;
let profile = {};
let cvs = [];
const SENSITIVE_SCREENING_PATTERN = /\b(?:id|identity|passport|visa)\s*(?:number|no\.?)\b|\b(?:race|ethnicity|gender|sex|medical|health|disability|bank details?|salary history|current salary|photo|picture|criminal record)\b/i;
const LEGACY_WORK_AUTHORISATION_QUESTION = "Are you legally authorised to work in South Africa?";
const GENERIC_WORK_AUTHORISATION_QUESTION = "Are you legally authorised to work in the country where this position is based?";
const RELATIVES_IN_ORGANISATION_TEMPLATE = "relatives_in_organisation";
const RELATIVE_DETAIL_TEMPLATE_KEYS = new Set(["relative_full_name", "relative_relationship"]);
const EMPLOYMENT_EQUITY_TEMPLATE = "employment_equity_self_identification";
const SCREENING_TEMPLATE_KEYS = new Set([
  "work_authorisation",
  "qualification",
  "experience",
  "drivers_licence",
  "relocation",
  "notice_period",
  "travel",
  "expected_ctc",
  "home_languages",
  EMPLOYMENT_EQUITY_TEMPLATE,
  RELATIVES_IN_ORGANISATION_TEMPLATE,
  ...RELATIVE_DETAIL_TEMPLATE_KEYS,
]);

function text(value, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function track(eventName, params = {}) {
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, {
      event_category: "direct_application",
      job_id: jobId,
      ...params,
    });
  }
}

function returnUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

function showAuthGate() {
  sessionStorage.setItem("careerUnifiedReturnUrl", returnUrl());
  panel.innerHTML = `
    <div class="auth-gate">
      <p class="eyebrow">Career Unified Direct Apply</p>
      <h1>Sign in to apply</h1>
      <p class="intro">Your Career Unified profile and saved CV will make this application faster.</p>
      <div class="auth-actions">
        <a class="login" href="/login.html">Log in</a>
        <a class="signup" href="/signup.html">Create account</a>
      </div>
    </div>`;
}

function showError(message) {
  panel.innerHTML = `
    <div class="auth-gate">
      <p class="eyebrow">Application unavailable</p>
      <h1>We could not open this application</h1>
      <p class="intro">${escapeHtml(message)}</p>
      <div class="auth-actions"><a class="login" href="/jobs">Browse jobs</a></div>
    </div>`;
}

function formatDate(value) {
  const raw = text(value);
  if (!raw) return "Not specified";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toLocaleDateString("en-ZA", {day: "2-digit", month: "short", year: "numeric"});
}

function renderSummary() {
  const company = text(currentJob.company, "Confidential");
  const location = text(currentJob.location, [currentJob.city, currentJob.country].filter(Boolean).join(", "));
  const logo = text(currentJob.logo);
  const slug = text(currentJob.slug);
  const jobHref = slug ? `/jobs/${encodeURIComponent(slug)}` : "/jobs";
  document.getElementById("backToJob").href = jobHref;

  summary.innerHTML = `
    <p class="eyebrow">You are applying for</p>
    <div class="summary-company">
      ${logo ? `<img class="company-logo" src="${escapeHtml(logo)}" alt="" onerror="this.onerror=null;this.src='/android-chrome-192x192.png'">` : ""}
      <div>
        <div class="summary-title">${escapeHtml(text(currentJob.title, "Job opportunity"))}</div>
        <div class="help">${escapeHtml(company)}</div>
      </div>
    </div>
    <div class="summary-meta">
      <div><span>Location</span><strong>${escapeHtml(location || "Not specified")}</strong></div>
      <div><span>Job type</span><strong>${escapeHtml(text(currentJob.type, "Not specified"))}</strong></div>
      <div><span>Closing date</span><strong>${escapeHtml(formatDate(currentJob.deadline))}</strong></div>
    </div>
    <p class="trust">Your application is shared only with ${escapeHtml(company)} for this vacancy. You can track its status from your Career Unified profile.</p>`;
}

function questionInput(question) {
  const id = `question_${question.id}`;
  const required = question.required ? " required" : "";
  const requiredMark = question.required ? ' <span class="required">*</span>' : "";
  const isRelativeDetail = RELATIVE_DETAIL_TEMPLATE_KEYS.has(question.templateKey);
  const conditionalAttributes = isRelativeDetail
    ? ` data-relative-detail="true" data-question-template="${escapeHtml(question.templateKey)}" hidden`
    : "";
  const conditionalClass = isRelativeDetail ? " conditional-question" : "";

  if (question.type === "yes_no") {
    return `
      <div class="question field${conditionalClass}"${conditionalAttributes}>
        <label for="${escapeHtml(id)}">${escapeHtml(question.label)}${requiredMark}</label>
        <select id="${escapeHtml(id)}" name="screening_${escapeHtml(question.id)}"${required}>
          <option value="">Select an answer</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </div>`;
  }

  if (question.type === "single_select") {
    const savedEthnicity = question.templateKey === EMPLOYMENT_EQUITY_TEMPLATE
      ? text(profile.ethnicity)
      : "";
    const options = (Array.isArray(question.options) ? question.options : [])
      .map((option) => {
        const selected = text(option) === savedEthnicity ? " selected" : "";
        return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(option)}</option>`;
      })
      .join("");
    const help = question.templateKey === EMPLOYMENT_EQUITY_TEMPLATE
      ? "Voluntary and shared with the employer for employment equity reporting only. You may change it or leave it blank."
      : "";
    return `
      <div class="question field${conditionalClass}"${conditionalAttributes}>
        <label for="${escapeHtml(id)}">${escapeHtml(question.label)}${requiredMark}</label>
        <select id="${escapeHtml(id)}" name="screening_${escapeHtml(question.id)}"${required}>
          <option value="">Select an answer</option>${options}
        </select>
        ${help ? `<p class="help">${help}</p>` : ""}
      </div>`;
  }

  if (question.type === "multi_select") {
    const savedHomeLanguages = question.templateKey === "home_languages"
      ? new Set((Array.isArray(profile.homeLanguages) ? profile.homeLanguages : [])
        .map((language) => text(language).toLowerCase())
        .filter(Boolean))
      : new Set();
    const options = (Array.isArray(question.options) ? question.options : [])
      .map((option) => {
        const selected = savedHomeLanguages.has(text(option).toLowerCase()) ? " selected" : "";
        return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(option)}</option>`;
      })
      .join("");
    const help = question.templateKey === "home_languages"
      ? "Pre-filled from your profile. Adjust the languages for this application if needed."
      : "Select every option that applies.";
    return `
      <div class="question field${conditionalClass}"${conditionalAttributes}>
        <label for="${escapeHtml(id)}">${escapeHtml(question.label)}${requiredMark}</label>
        <select id="${escapeHtml(id)}" class="multi-select" name="screening_${escapeHtml(question.id)}" multiple size="6"${required}>
          ${options}
        </select>
        <p class="help">${help}</p>
      </div>`;
  }

  if (question.type === "number") {
    return `
      <div class="question field${conditionalClass}"${conditionalAttributes}>
        <label for="${escapeHtml(id)}">${escapeHtml(question.label)}${requiredMark}</label>
        <input id="${escapeHtml(id)}" name="screening_${escapeHtml(question.id)}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off" data-numeric-answer="true"${required}>
        <p class="help">Numbers only</p>
      </div>`;
  }

  return `
    <div class="question field${conditionalClass}"${conditionalAttributes}>
      <label for="${escapeHtml(id)}">${escapeHtml(question.label)}${requiredMark}</label>
      <textarea id="${escapeHtml(id)}" name="screening_${escapeHtml(question.id)}" maxlength="1200"${required}></textarea>
    </div>`;
}

function relativeOrganisationQuestion(questions) {
  return questions.find(question => question.templateKey === RELATIVES_IN_ORGANISATION_TEMPLATE);
}

function configureRelativeQuestionFlow(form, questions) {
  const relativesQuestion = relativeOrganisationQuestion(questions);
  const detailCards = Array.from(form.querySelectorAll("[data-relative-detail='true']"));
  if (!relativesQuestion || !detailCards.length) return;

  const relativesField = form.elements[`screening_${relativesQuestion.id}`];
  if (!(relativesField instanceof HTMLSelectElement)) return;

  const updateRelativeDetails = () => {
    const shouldShowDetails = relativesField.value === "Yes";
    detailCards.forEach(card => {
      card.hidden = !shouldShowDetails;
      card.querySelectorAll("input, select, textarea").forEach(field => {
        field.disabled = !shouldShowDetails;
        if (!shouldShowDetails) field.value = "";
      });
    });
  };

  relativesField.addEventListener("change", updateRelativeDetails);
  updateRelativeDetails();
}

function configureNumericQuestionInputs(form) {
  form.querySelectorAll("[data-numeric-answer='true']").forEach((field) => {
    field.addEventListener("input", () => {
      const numericValue = field.value.replace(/\D+/g, "").slice(0, 12);
      if (field.value !== numericValue) field.value = numericValue;
    });
  });
}

function countryAwareQuestion(question) {
  const label = text(question?.label);
  const requestedTemplateKey = text(question?.templateKey).slice(0, 80);
  const templateKey = SCREENING_TEMPLATE_KEYS.has(requestedTemplateKey)
    ? requestedTemplateKey
    : label === LEGACY_WORK_AUTHORISATION_QUESTION || label === GENERIC_WORK_AUTHORISATION_QUESTION
      ? "work_authorisation"
      : "";
  const isWorkAuthorisation = templateKey === "work_authorisation"
    || label === LEGACY_WORK_AUTHORISATION_QUESTION
    || label === GENERIC_WORK_AUTHORISATION_QUESTION;
  if (!isWorkAuthorisation) return {...question, templateKey};

  const country = text(currentJob?.country).slice(0, 120);
  return {
    ...question,
    templateKey: "work_authorisation",
    label: country
      ? `Are you legally authorised to work in ${country}?`
      : GENERIC_WORK_AUTHORISATION_QUESTION,
  };
}

function applicationQuestions() {
  return (Array.isArray(currentJob.screeningQuestions) ? currentJob.screeningQuestions : [])
    .map(countryAwareQuestion)
    .filter(question => question.templateKey === EMPLOYMENT_EQUITY_TEMPLATE || !SENSITIVE_SCREENING_PATTERN.test(text(question?.label)))
    .slice(0, 8);
}

function renderForm() {
  const qualification = text(profile.degreeType || profile.highestQualification);
  const cvOptions = cvs.map((cv) => (
    `<option value="${escapeHtml(cv.id)}">${escapeHtml(text(cv.cvFileName, "Saved CV"))}</option>`
  )).join("");
  const questions = applicationQuestions();

  panel.innerHTML = `
    <p class="eyebrow">Career Unified Direct Apply</p>
    <h1>${escapeHtml(text(currentJob.title, "Submit your application"))}</h1>
    <p class="intro">Review your saved details, answer the employer's questions, and submit.</p>
    <form id="directApplicationForm">
      <section class="step">
        <div class="step-title"><span class="step-number">1</span><h2>Your profile</h2></div>
        <div class="grid">
          <div class="field">
            <label for="fullName">Full name <span class="required">*</span></label>
            <input id="fullName" name="fullName" value="${escapeHtml(text(profile.name || currentUser.displayName))}" maxlength="120" required>
          </div>
          <div class="field">
            <label for="email">Verified email</label>
            <input id="email" value="${escapeHtml(text(currentUser.email || profile.email))}" disabled>
          </div>
          <div class="field">
            <label for="phone">Telephone <span class="required">*</span></label>
            <input id="phone" name="phone" type="tel" value="${escapeHtml(text(profile.phone))}" maxlength="40" required>
          </div>
          <div class="field">
            <label for="location">City/town and province <span class="required">*</span></label>
            <input id="location" name="location" value="${escapeHtml(text(profile.location))}" maxlength="160" required>
          </div>
          <div class="field full">
            <label for="qualification">Highest qualification</label>
            <input id="qualification" name="qualification" value="${escapeHtml(qualification)}" maxlength="160" placeholder="For example: Diploma in Human Resources">
          </div>
        </div>
      </section>

      <section class="step">
        <div class="step-title"><span class="step-number">2</span><h2>CV and application</h2></div>
        <div class="field">
          <label for="cvId">CV <span class="required">*</span></label>
          <select id="cvId" name="cvId">
            <option value="">Select a saved CV</option>
            ${cvOptions}
            <option value="__upload">Upload a different CV</option>
          </select>
          <p class="help">The recruiter receives a private snapshot of the CV you choose.</p>
        </div>
        <div class="cv-upload" id="newCvWrap" hidden>
          <div class="field">
            <label for="newCv">Upload PDF or DOCX, maximum 5MB</label>
            <input id="newCv" type="file" accept=".pdf,.docx">
          </div>
        </div>
        <div class="field" style="margin-top:18px">
          <label for="coverLetter">Short cover note <span class="help">(optional)</span></label>
          <textarea id="coverLetter" name="coverLetter" maxlength="4000" placeholder="Explain briefly why this opportunity fits your experience and goals."></textarea>
        </div>
      </section>

      ${questions.length ? `
        <section class="step">
          <div class="step-title"><span class="step-number">3</span><h2>Employer questions</h2></div>
          <div class="question-list">${questions.map(questionInput).join("")}</div>
        </section>` : ""}

      <section class="step">
        <div class="step-title"><span class="step-number">${questions.length ? "4" : "3"}</span><h2>Review and submit</h2></div>
        <div class="checks">
          <label class="check"><input id="declarationAccepted" type="checkbox" required><span>I declare that the information in this application is accurate.</span></label>
          <label class="check"><input id="privacyAccepted" type="checkbox" required><span>I understand that this application will be shared with ${escapeHtml(text(currentJob.company, "the recruiter"))} for this vacancy, as described in the <a href="/privacy" target="_blank">Privacy Policy</a>.</span></label>
          <label class="check"><input id="termsAccepted" type="checkbox" required><span>I have read and accept the <a href="/terms" target="_blank">Terms and Conditions</a>.</span></label>
          <label class="check"><input id="saveToProfile" type="checkbox" checked><span>Save updated contact details to my Career Unified profile.</span></label>
        </div>
        <div id="formStatus" class="status" role="alert"></div>
        <div class="submit-row">
          <p class="help">You can track this application from My Applications.</p>
          <button class="primary-btn" id="submitApplication" type="submit">Submit application</button>
        </div>
      </section>
    </form>`;

  const cvSelect = document.getElementById("cvId");
  if (!cvs.length) cvSelect.value = "__upload";
  document.getElementById("newCvWrap").hidden = cvSelect.value !== "__upload";
  cvSelect.addEventListener("change", () => {
    document.getElementById("newCvWrap").hidden = cvSelect.value !== "__upload";
  });
  document.getElementById("directApplicationForm").addEventListener("submit", submitApplication);
  const applicationForm = document.getElementById("directApplicationForm");
  configureRelativeQuestionFlow(applicationForm, questions);
  configureNumericQuestionInputs(applicationForm);
  track("job_application_started", {application_method: "career_unified_direct"});
}

function renderExistingApplication(application) {
  const status = text(application.status, "submitted")
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
  panel.innerHTML = `
    <div class="success-view">
      <div class="success-mark">✓</div>
      <p class="eyebrow">Application already submitted</p>
      <h1>You already applied for this vacancy</h1>
      <p class="intro">Current status: ${escapeHtml(status)}. Career Unified keeps one clear application per candidate and vacancy.</p>
      <div class="success-actions">
        <a class="applications-link" href="/account-page.html?tab=applications">View My Applications</a>
        <a href="/jobs">Browse more jobs</a>
      </div>
    </div>`;
}

function renderSubmissionSuccess(confirmation) {
  panel.innerHTML = `
    <div class="success-view">
      <div class="success-mark">✓</div>
      <p class="eyebrow">Application submitted successfully</p>
      <h1>Your application went through</h1>
      <p class="intro">Your application for ${escapeHtml(confirmation.jobTitle)} is with ${escapeHtml(confirmation.company)}. Reference: ${escapeHtml(confirmation.applicationId)}</p>
      <div class="success-actions">
        <a class="applications-link" href="/account-page.html?tab=applications&submitted=1">View My Applications</a>
        <a href="/jobs">Browse more jobs</a>
      </div>
    </div>`;
}

function setFormStatus(message, type = "error") {
  const status = document.getElementById("formStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `status show ${type}`;
}

async function uploadCv(file, token) {
  const formData = new FormData();
  formData.append("cv", file);
  const response = await fetch("/.netlify/functions/upload-profile-cv", {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`},
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not upload your CV.");
  return payload.id;
}

async function submitApplication(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const button = document.getElementById("submitApplication");
  button.disabled = true;
  button.textContent = "Submitting...";
  setFormStatus("Securely preparing your application...", "info");

  try {
    const token = await getIdToken(currentUser, true);
    let cvId = document.getElementById("cvId").value;
    if (cvId === "__upload") {
      const file = document.getElementById("newCv").files[0];
      if (!file) throw new Error("Choose a PDF or DOCX CV to upload.");
      if (file.size > 5 * 1024 * 1024) throw new Error("CV file size must be less than 5MB.");
      cvId = await uploadCv(file, token);
    }
    if (!cvId) throw new Error("Select or upload a CV.");

    const answers = {};
    applicationQuestions().forEach((question) => {
      const field = form.elements[`screening_${question.id}`];
      if (!field || field.disabled) return;
      answers[question.id] = question.type === "multi_select" && field instanceof HTMLSelectElement
        ? Array.from(field.selectedOptions, (option) => option.value)
        : field.value;
    });

    const response = await fetch("/.netlify/functions/submit-job-application", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobId,
        cvId,
        contact: {
          fullName: form.fullName.value,
          phone: form.phone.value,
          location: form.location.value,
          qualification: form.qualification.value,
        },
        coverLetter: form.coverLetter.value,
        answers,
        declarationAccepted: document.getElementById("declarationAccepted").checked,
        privacyAccepted: document.getElementById("privacyAccepted").checked,
        termsAccepted: document.getElementById("termsAccepted").checked,
        saveToProfile: document.getElementById("saveToProfile").checked,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 409 && payload.existingApplication) {
      renderExistingApplication(payload.existingApplication);
      return;
    }
    if (!response.ok) throw new Error(payload.error || "Could not submit your application.");

    track("job_application_submitted", {
      application_method: "career_unified_direct",
      screening_result: payload.screeningResult || "review",
    });
    const confirmation = {
      applicationId: text(payload.applicationId),
      jobId,
      jobTitle: text(currentJob.title, "Job opportunity"),
      company: text(currentJob.company, "the recruiter"),
      submittedAt: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(APPLICATION_CONFIRMATION_KEY, JSON.stringify(confirmation));
      window.location.assign(
        `/application-success.html?application=${encodeURIComponent(confirmation.applicationId)}`,
      );
    } catch {
      renderSubmissionSuccess(confirmation);
    }
  } catch (error) {
    setFormStatus(error.message || "Could not submit your application. Please try again.");
    button.disabled = false;
    button.textContent = "Submit application";
  }
}

async function loadApplication(user) {
  currentUser = user;
  if (!currentJob) {
    const available = await loadJob();
    if (!available) return;
  }

  const token = await getIdToken(user);
  const response = await fetch(
    `/.netlify/functions/get-direct-application-context?jobId=${encodeURIComponent(jobId)}`,
    {headers: {Authorization: `Bearer ${token}`}},
  );
  const context = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(context.error || "Application details could not be loaded.");

  profile = context.profile && typeof context.profile === "object" ? context.profile : {};
  if (context.existingApplication) {
    renderExistingApplication(context.existingApplication);
    return;
  }
  cvs = (Array.isArray(context.cvs) ? context.cvs : [])
    .filter((cv) => text(cv.status || "active").toLowerCase() === "active")
    .sort((a, b) => timestampMs(b.uploadedAt) - timestampMs(a.uploadedAt));
  renderForm();
}

async function loadJob() {
  if (!jobId) {
    showError("The job reference is missing.");
    summary.innerHTML = "";
    return false;
  }

  const jobSnap = await getDoc(doc(db, "jobs", jobId));
  if (!jobSnap.exists()) {
    showError("This job is no longer available.");
    summary.innerHTML = "";
    return false;
  }
  currentJob = {id: jobSnap.id, ...jobSnap.data()};
  if (text(currentJob.applicationMethod).toLowerCase() !== "direct") {
    showError("This employer is not accepting direct applications on Career Unified.");
    summary.innerHTML = "";
    return false;
  }
  renderSummary();
  return true;
}

onAuthStateChanged(auth, async (user) => {
  try {
    const available = currentJob ? true : await loadJob();
    if (!available) return;
    if (!user) {
      showAuthGate();
      return;
    }
    await loadApplication(user);
  } catch (error) {
    console.error("DIRECT_APPLY_LOAD_ERROR", error);
    showError("Application details could not be loaded. Please refresh and try again.");
  }
});
