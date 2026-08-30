import {getApp, getApps, initializeApp} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {getAuth, getIdToken, onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  where,
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
const GENDER_OPTIONS = [
  "Female",
  "Male",
  "Non-binary",
  "Another gender",
  "Prefer not to say",
];
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
const cityAutocompleteState = new Map();
const CITY_SUGGESTIONS = [
  {city: "Pretoria", province: "Gauteng", country: "South Africa"},
  {city: "Johannesburg", province: "Gauteng", country: "South Africa"},
  {city: "Soweto", province: "Gauteng", country: "South Africa"},
  {city: "Midrand", province: "Gauteng", country: "South Africa"},
  {city: "Sandton", province: "Gauteng", country: "South Africa"},
  {city: "Benoni", province: "Gauteng", country: "South Africa"},
  {city: "Boksburg", province: "Gauteng", country: "South Africa"},
  {city: "Germiston", province: "Gauteng", country: "South Africa"},
  {city: "Roodepoort", province: "Gauteng", country: "South Africa"},
  {city: "Vereeniging", province: "Gauteng", country: "South Africa"},
  {city: "Bloemfontein", province: "Free State", country: "South Africa"},
  {city: "Welkom", province: "Free State", country: "South Africa"},
  {city: "Bethlehem", province: "Free State", country: "South Africa"},
  {city: "Kroonstad", province: "Free State", country: "South Africa"},
  {city: "Durban", province: "KwaZulu-Natal", country: "South Africa"},
  {city: "Pietermaritzburg", province: "KwaZulu-Natal", country: "South Africa"},
  {city: "Richards Bay", province: "KwaZulu-Natal", country: "South Africa"},
  {city: "Newcastle", province: "KwaZulu-Natal", country: "South Africa"},
  {city: "Empangeni", province: "KwaZulu-Natal", country: "South Africa"},
  {city: "Port Shepstone", province: "KwaZulu-Natal", country: "South Africa"},
  {city: "Cape Town", province: "Western Cape", country: "South Africa"},
  {city: "Bellville", province: "Western Cape", country: "South Africa"},
  {city: "Paarl", province: "Western Cape", country: "South Africa"},
  {city: "Stellenbosch", province: "Western Cape", country: "South Africa"},
  {city: "George", province: "Western Cape", country: "South Africa"},
  {city: "Worcester", province: "Western Cape", country: "South Africa"},
  {city: "East London", province: "Eastern Cape", country: "South Africa"},
  {city: "Gqeberha", province: "Eastern Cape", country: "South Africa"},
  {city: "Port Elizabeth", province: "Eastern Cape", country: "South Africa"},
  {city: "Mthatha", province: "Eastern Cape", country: "South Africa"},
  {city: "Komani", province: "Eastern Cape", country: "South Africa"},
  {city: "Bhisho", province: "Eastern Cape", country: "South Africa"},
  {city: "Polokwane", province: "Limpopo", country: "South Africa"},
  {city: "Tzaneen", province: "Limpopo", country: "South Africa"},
  {city: "Thohoyandou", province: "Limpopo", country: "South Africa"},
  {city: "Mokopane", province: "Limpopo", country: "South Africa"},
  {city: "Mbombela", province: "Mpumalanga", country: "South Africa"},
  {city: "Nelspruit", province: "Mpumalanga", country: "South Africa"},
  {city: "Emalahleni", province: "Mpumalanga", country: "South Africa"},
  {city: "Secunda", province: "Mpumalanga", country: "South Africa"},
  {city: "Kimberley", province: "Northern Cape", country: "South Africa"},
  {city: "Upington", province: "Northern Cape", country: "South Africa"},
  {city: "Kuruman", province: "Northern Cape", country: "South Africa"},
  {city: "Rustenburg", province: "North West", country: "South Africa"},
  {city: "Mahikeng", province: "North West", country: "South Africa"},
  {city: "Klerksdorp", province: "North West", country: "South Africa"},
  {city: "Potchefstroom", province: "North West", country: "South Africa"},
];
const PROVINCE_SUGGESTIONS = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];
const COUNTRY_CODES = `
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
  BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
  CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
  DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
  HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
  KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
  MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
  NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
  QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
  TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
  VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`.trim().split(/\s+/);
const COUNTRY_CODE_SET = new Set(COUNTRY_CODES);
const REGION_DISPLAY_NAMES = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], {type: "region"})
  : null;
const NATIONALITY_ALIASES = new Map([
  ["south african", "ZA"],
  ["zimbabwean", "ZW"],
  ["zambian", "ZM"],
  ["namibian", "NA"],
  ["botswanan", "BW"],
  ["mosotho", "LS"],
  ["swazi", "SZ"],
  ["mozambican", "MZ"],
  ["malawian", "MW"],
  ["nigerian", "NG"],
  ["ghanaian", "GH"],
  ["kenyan", "KE"],
  ["ugandan", "UG"],
  ["tanzanian", "TZ"],
]);

function regionName(code) {
  if (code === "XK") return "Kosovo";
  return REGION_DISPLAY_NAMES?.of(code) || code;
}

const NATIONALITY_OPTIONS = COUNTRY_CODES
  .map((code) => ({code, name: regionName(code)}))
  .sort((left, right) => {
    if (left.code === "ZA") return -1;
    if (right.code === "ZA") return 1;
    return left.name.localeCompare(right.name, "en");
  });

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

function placeLabel(place) {
  return [place.city, place.province, place.country].filter(Boolean).join(", ");
}

function queryCities(term) {
  const normalized = String(term || "").trim().toLowerCase();
  if (!normalized) return [];
  return CITY_SUGGESTIONS
    .map((place) => ({
      ...place,
      haystack: `${place.city} ${place.province} ${place.country}`.toLowerCase(),
    }))
    .filter((place) => place.haystack.includes(normalized))
    .slice(0, 8);
}

function closePickerSuggestions(input) {
  const state = cityAutocompleteState.get(input.id);
  if (!state) return;
  state.panel.hidden = true;
  state.panel.replaceChildren();
  state.suggestions = [];
  state.activeIndex = -1;
  input.setAttribute("aria-expanded", "false");
}

function applyCitySuggestion(input, suggestion) {
  input.value = suggestion.city;
  const provinceField = document.getElementById("province");
  if (provinceField) provinceField.value = suggestion.province;
  closePickerSuggestions(input);
}

function applyProvinceSuggestion(input, suggestion) {
  input.value = suggestion;
  closePickerSuggestions(input);
}

function applyNationalitySuggestion(input, suggestion) {
  input.value = suggestion.name;
  input.setCustomValidity("");
  const codeField = document.getElementById("nationalityCode");
  if (codeField instanceof HTMLInputElement) codeField.value = suggestion.code;
  closePickerSuggestions(input);
}

function renderPickerSuggestions(input, suggestions) {
  const state = cityAutocompleteState.get(input.id);
  if (!state) return;
  state.panel.replaceChildren();
  state.suggestions = suggestions;
  state.activeIndex = suggestions.length ? 0 : -1;
  if (!suggestions.length) {
    closePickerSuggestions(input);
    return;
  }

  suggestions.forEach((suggestion, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "picker-suggestion";
    if (index === state.activeIndex) option.classList.add("is-active");
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", index === state.activeIndex ? "true" : "false");
    if (state.type === "province") {
      option.innerHTML = `<strong>${escapeHtml(suggestion)}</strong>`;
    } else if (state.type === "nationality") {
      option.innerHTML = `<strong>${escapeHtml(suggestion.name)}</strong>`;
    } else {
      option.innerHTML = `<strong>${escapeHtml(suggestion.city)}</strong><span>${escapeHtml(placeLabel(suggestion))}</span>`;
    }
    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      if (state.type === "province") {
        applyProvinceSuggestion(input, suggestion);
      } else if (state.type === "nationality") {
        applyNationalitySuggestion(input, suggestion);
      } else {
        applyCitySuggestion(input, suggestion);
      }
    });
    option.addEventListener("mouseenter", () => {
      state.activeIndex = index;
      Array.from(state.panel.children).forEach((child, childIndex) => {
        child.classList.toggle("is-active", childIndex === index);
        child.setAttribute("aria-selected", childIndex === index ? "true" : "false");
      });
    });
    state.panel.append(option);
  });

  state.panel.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function moveCitySuggestion(input, direction) {
  const state = cityAutocompleteState.get(input.id);
  if (!state?.suggestions?.length) return;
  state.activeIndex = (state.activeIndex + direction + state.suggestions.length) % state.suggestions.length;
  Array.from(state.panel.children).forEach((child, childIndex) => {
    child.classList.toggle("is-active", childIndex === state.activeIndex);
    child.setAttribute("aria-selected", childIndex === state.activeIndex ? "true" : "false");
  });
}

function syncCitySuggestions(input, openOnEmpty = false) {
  const term = input.value.trim();
  const suggestions = openOnEmpty && !term ? CITY_SUGGESTIONS.slice(0, 8) : queryCities(term);
  renderPickerSuggestions(input, suggestions);
}

function queryProvinces(term) {
  const normalized = String(term || "").trim().toLowerCase();
  if (!normalized) return [];
  return PROVINCE_SUGGESTIONS.filter((province) => province.toLowerCase().includes(normalized)).slice(0, 8);
}

function syncProvinceSuggestions(input, openOnEmpty = false) {
  const term = input.value.trim();
  const suggestions = openOnEmpty && !term ? PROVINCE_SUGGESTIONS.slice(0, 8) : queryProvinces(term);
  renderPickerSuggestions(input, suggestions);
}

function queryNationalities(term) {
  const normalized = String(term || "").trim().toLowerCase();
  if (!normalized) return [];
  return NATIONALITY_OPTIONS.filter((option) => {
    const aliases = Array.from(NATIONALITY_ALIASES.entries())
      .filter(([, code]) => code === option.code)
      .map(([alias]) => alias);
    return `${option.name} ${option.code} ${aliases.join(" ")}`.toLowerCase().includes(normalized);
  }).slice(0, 8);
}

function syncNationalitySuggestions(input, openOnEmpty = false) {
  const term = input.value.trim();
  const suggestions = openOnEmpty && !term ? NATIONALITY_OPTIONS.slice(0, 8) : queryNationalities(term);
  renderPickerSuggestions(input, suggestions);
}

function nationalityOption(value, codeValue) {
  const code = text(codeValue).toUpperCase();
  if (COUNTRY_CODE_SET.has(code)) {
    return NATIONALITY_OPTIONS.find((option) => option.code === code) || null;
  }

  const normalized = text(value).toLowerCase();
  const aliasCode = NATIONALITY_ALIASES.get(normalized);
  if (aliasCode) return NATIONALITY_OPTIONS.find((option) => option.code === aliasCode) || null;
  return NATIONALITY_OPTIONS.find((option) => option.name.toLowerCase() === normalized) || null;
}

function validateNationalitySelection() {
  const input = document.getElementById("nationality");
  const codeField = document.getElementById("nationalityCode");
  if (!(input instanceof HTMLInputElement) || !(codeField instanceof HTMLInputElement)) return true;

  const value = input.value.trim();
  if (!value) {
    codeField.value = "";
    input.setCustomValidity("");
    return true;
  }

  const selection = NATIONALITY_OPTIONS.find(
    (option) => option.code === codeField.value && option.name === value,
  );
  input.setCustomValidity(selection ? "" : "Choose a nationality from the suggestions.");
  return Boolean(selection);
}

function setupPickerAutocomplete(config) {
  const input = document.getElementById(config.inputId);
  const panel = document.getElementById(config.panelId);
  const toggle = document.getElementById(config.toggleId);
  if (!(input instanceof HTMLInputElement) || !panel || !toggle) return;

  cityAutocompleteState.set(config.inputId, {
    panel,
    toggle,
    type: config.type,
    suggestions: [],
    activeIndex: -1,
  });

  input.addEventListener("input", () => {
    if (config.type === "nationality") {
      const codeField = document.getElementById("nationalityCode");
      if (codeField instanceof HTMLInputElement) codeField.value = "";
      input.setCustomValidity("");
    }
    config.sync(input);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) config.sync(input);
  });
  input.addEventListener("keydown", (event) => {
    const state = cityAutocompleteState.get(config.inputId);
    if (!state) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (state.panel.hidden) {
        config.sync(input, true);
        return;
      }
      moveCitySuggestion(input, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!state.panel.hidden) moveCitySuggestion(input, -1);
    } else if (event.key === "Enter") {
      if (!state.panel.hidden && state.suggestions[state.activeIndex]) {
        event.preventDefault();
        if (state.type === "province") {
          applyProvinceSuggestion(input, state.suggestions[state.activeIndex]);
        } else if (state.type === "nationality") {
          applyNationalitySuggestion(input, state.suggestions[state.activeIndex]);
        } else {
          applyCitySuggestion(input, state.suggestions[state.activeIndex]);
        }
      }
    } else if (event.key === "Escape") {
      closePickerSuggestions(input);
    }
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => closePickerSuggestions(input), 120);
  });
  toggle.addEventListener("click", () => {
    const state = cityAutocompleteState.get(config.inputId);
    if (!state) return;
    if (state.panel.hidden) {
      input.focus();
      config.sync(input, true);
    } else {
      closePickerSuggestions(input);
    }
  });
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

function splitProfileLocation(value, cityValue = "", provinceValue = "") {
  const savedCity = text(cityValue);
  const savedProvince = text(provinceValue);
  if (savedCity || savedProvince) {
    return {city: savedCity, province: savedProvince};
  }
  const raw = text(value);
  if (!raw) return {city: "", province: ""};
  const parts = raw.split(",").map((part) => text(part)).filter(Boolean);
  if (parts.length >= 2) {
    return {
      city: parts[0],
      province: parts.slice(1).join(", "),
    };
  }
  return {city: raw, province: ""};
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
    </div>`;
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
        const optionId = `${id}_${text(option).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        const checked = savedHomeLanguages.has(text(option).toLowerCase()) ? " checked" : "";
        return `
          <label class="choice-pill" for="${escapeHtml(optionId)}">
            <input id="${escapeHtml(optionId)}" type="checkbox" name="screening_${escapeHtml(question.id)}" value="${escapeHtml(option)}"${checked}>
            <span>${escapeHtml(option)}</span>
          </label>`;
      })
      .join("");
    const help = question.templateKey === "home_languages"
      ? ""
      : "Select every option that applies.";
    return `
      <div class="question field${conditionalClass}"${conditionalAttributes}>
        <div class="field-label" id="${escapeHtml(id)}_label">${escapeHtml(question.label)}${requiredMark}</div>
        <div class="choice-grid" role="group" aria-labelledby="${escapeHtml(id)}_label" data-multi-answer="${escapeHtml(question.id)}" data-required="${question.required ? "true" : "false"}">
          ${options}
        </div>
        ${help ? `<p class="help">${help}</p>` : ""}
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
  const profileLocation = splitProfileLocation(profile.location, profile.city, profile.province);
  const selectedNationality = nationalityOption(profile.nationality, profile.nationalityCode);
  const selectedGender = text(profile.gender);
  const genderOptions = GENDER_OPTIONS.map((gender) => (
    `<option value="${escapeHtml(gender)}" ${selectedGender === gender ? "selected" : ""}>${escapeHtml(gender)}</option>`
  )).join("");
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
            <label for="nationality">Nationality</label>
            <div class="picker-combobox">
              <input id="nationality" name="nationality" value="${escapeHtml(selectedNationality?.name || "")}" maxlength="100" autocomplete="off" placeholder="Search nationality" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="nationalitySuggestions">
              <input id="nationalityCode" name="nationalityCode" type="hidden" value="${escapeHtml(selectedNationality?.code || "")}">
              <button class="picker-toggle" id="nationalityToggle" type="button" aria-label="Show nationality suggestions">⌕</button>
              <div class="picker-suggestions" id="nationalitySuggestions" role="listbox" hidden></div>
            </div>
          </div>
          <div class="field">
            <label for="city">City <span class="required">*</span></label>
            <div class="picker-combobox">
              <input id="city" name="city" value="${escapeHtml(profileLocation.city)}" maxlength="80" autocomplete="off" required aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="citySuggestions">
              <button class="picker-toggle" id="cityToggle" type="button" aria-label="Show city suggestions">⌕</button>
              <div class="picker-suggestions" id="citySuggestions" role="listbox" hidden></div>
            </div>
          </div>
          <div class="field">
            <label for="province">Province <span class="required">*</span></label>
            <div class="picker-combobox">
              <input id="province" name="province" value="${escapeHtml(profileLocation.province)}" maxlength="80" autocomplete="off" required aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="provinceSuggestions">
              <button class="picker-toggle" id="provinceToggle" type="button" aria-label="Show province suggestions">⌕</button>
              <div class="picker-suggestions" id="provinceSuggestions" role="listbox" hidden></div>
            </div>
          </div>
          <div class="field full">
            <label for="qualification">Highest qualification</label>
            <input id="qualification" name="qualification" value="${escapeHtml(qualification)}" maxlength="160" placeholder="For example: Diploma in Human Resources">
          </div>
          <div class="field">
            <label for="gender">Gender <span class="help">(optional)</span></label>
            <select id="gender" name="gender">
              <option value="">Select gender</option>
              ${genderOptions}
            </select>
            <p class="help">This optional detail is not used for candidate matching or scoring.</p>
          </div>
        </div>
      </section>

      <section class="step">
        <div class="step-title"><span class="step-number">2</span><h2>CV and application</h2></div>
        <div class="field">
          <label for="cvId">CV <span class="required">*</span></label>
          <select id="cvId" name="cvId">
            <option value="" ${cvs.length ? "disabled" : "selected"}>${cvs.length ? "Choose a different saved CV" : "Select a saved CV"}</option>
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
          <label class="check"><input id="privacyAccepted" type="checkbox" required aria-required="true"><span>Do you consent to the processing of your personal information in accordance with the <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> of this platform?</span></label>
          <label class="check"><input id="termsAccepted" type="checkbox" required aria-required="true"><span>Do you confirm that you have read, understood and agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms and Conditions</a> of Application and use of this platform?</span></label>
        </div>
        <div id="formStatus" class="status" role="alert"></div>
        <div class="submit-row">
          <p class="help">You can track this application from My Applications.</p>
          <button class="primary-btn" id="submitApplication" type="submit">Submit application</button>
        </div>
      </section>
    </form>`;

  const cvSelect = document.getElementById("cvId");
  if (cvs.length) {
    cvSelect.value = text(cvs[0]?.id);
  } else {
    cvSelect.value = "__upload";
  }
  document.getElementById("newCvWrap").hidden = cvSelect.value !== "__upload";
  cvSelect.addEventListener("change", () => {
    document.getElementById("newCvWrap").hidden = cvSelect.value !== "__upload";
  });
  document.getElementById("directApplicationForm").addEventListener("submit", submitApplication);
  const applicationForm = document.getElementById("directApplicationForm");
  configureRelativeQuestionFlow(applicationForm, questions);
  configureNumericQuestionInputs(applicationForm);
  setupPickerAutocomplete({
    inputId: "city",
    panelId: "citySuggestions",
    toggleId: "cityToggle",
    type: "city",
    sync: syncCitySuggestions,
  });
  setupPickerAutocomplete({
    inputId: "province",
    panelId: "provinceSuggestions",
    toggleId: "provinceToggle",
    type: "province",
    sync: syncProvinceSuggestions,
  });
  setupPickerAutocomplete({
    inputId: "nationality",
    panelId: "nationalitySuggestions",
    toggleId: "nationalityToggle",
    type: "nationality",
    sync: syncNationalitySuggestions,
  });
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
  validateNationalitySelection();
  if (!form.reportValidity()) return;

  const button = document.getElementById("submitApplication");
  button.disabled = true;
  button.textContent = "Submitting...";
  setFormStatus("Securely preparing your application...", "info");

  try {
    const token = await getIdToken(currentUser, true);
    let cvId = document.getElementById("cvId").value;
    if (!cvId && cvs.length) {
      cvId = text(cvs[0]?.id);
    }
    if (cvId === "__upload") {
      const file = document.getElementById("newCv").files[0];
      if (!file) throw new Error("Choose a PDF or DOCX CV to upload.");
      if (file.size > 5 * 1024 * 1024) throw new Error("CV file size must be less than 5MB.");
      cvId = await uploadCv(file, token);
    }
    if (!cvId) throw new Error("Select or upload a CV.");

    const answers = {};
    applicationQuestions().forEach((question) => {
      if (question.type === "multi_select") {
        const fieldName = `screening_${question.id}`;
        const checkedOptions = Array.from(form.querySelectorAll("input[type='checkbox']:checked"))
          .filter((option) => option.name === fieldName);
        const values = checkedOptions.map((option) => option.value);
        if (question.required && !values.length) {
          const group = Array.from(form.querySelectorAll("[data-multi-answer]"))
            .find((element) => element.dataset.multiAnswer === question.id);
          group?.scrollIntoView({block: "center", behavior: "smooth"});
          throw new Error(`Please select at least one option for: ${text(question.label)}`);
        }
        answers[question.id] = values;
        return;
      }

      const field = form.elements[`screening_${question.id}`];
      if (!field || field.disabled) return;
      answers[question.id] = field.value;
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
          city: form.city.value,
          province: form.province.value,
          nationality: form.nationality.value,
          nationalityCode: form.nationalityCode.value,
          location: [text(form.city.value, ""), text(form.province.value, "")]
            .filter(Boolean)
            .join(", "),
          qualification: form.qualification.value,
          gender: form.gender.value,
        },
        coverLetter: form.coverLetter.value,
        answers,
        privacyAccepted: document.getElementById("privacyAccepted").checked,
        termsAccepted: document.getElementById("termsAccepted").checked,
        talentPoolConsent: false,
        saveToProfile: true,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 409 && payload.existingApplication) {
      renderExistingApplication(payload.existingApplication);
      return;
    }
    if (!response.ok) {
      const message = payload.error || "Could not submit your application.";
      const reference = text(payload.reference);
      throw new Error(reference ? `${message} Support reference: ${reference}.` : message);
    }

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
  let context = await response.json().catch(() => ({}));
  if (response.status === 404) {
    // Keep Direct Apply available if a static Netlify deploy omits the context function.
    context = await loadApplicationContextFromFirestore(user);
    track("direct_apply_context_fallback", {reason: "function_not_found"});
  } else if (!response.ok) {
    throw new Error(context.error || "Application details could not be loaded.");
  }

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

async function loadApplicationContextFromFirestore(user) {
  const [profileSnap, cvsSnap, applicationsSnap] = await Promise.all([
    getDoc(doc(db, "users", user.uid)),
    getDocs(query(
      collection(db, "cvs"),
      where("userId", "==", user.uid),
      limit(50),
    )),
    getDocs(query(
      collection(db, "applications"),
      where("candidateId", "==", user.uid),
      limit(200),
    )),
  ]);

  const profileData = profileSnap.exists() ? profileSnap.data() : {};
  const existingSnap = applicationsSnap.docs.find((applicationSnap) => (
    text(applicationSnap.data()?.jobId) === jobId
  ));
  const existingData = existingSnap?.data() || null;

  return {
    profile: {
      name: text(profileData.name),
      email: text(profileData.email),
      phone: text(profileData.phone),
      location: text(profileData.location),
      city: text(profileData.city),
      province: text(profileData.province),
      nationality: text(profileData.nationality),
      nationalityCode: text(profileData.nationalityCode).toUpperCase(),
      degreeType: text(profileData.degreeType || profileData.highestQualification),
      highestQualification: text(profileData.highestQualification),
      homeLanguages: Array.isArray(profileData.homeLanguages) ? profileData.homeLanguages : [],
      ethnicity: text(profileData.ethnicity),
    },
    cvs: cvsSnap.docs.map((cvSnap) => ({id: cvSnap.id, ...cvSnap.data()})),
    existingApplication: existingSnap && existingData
      ? {id: existingSnap.id, status: text(existingData.status, "submitted")}
      : null,
  };
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
    showError(error?.message || "Application details could not be loaded. Please refresh and try again.");
  }
});
