import {getApp, getApps, initializeApp} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  getIdToken,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  writeBatch,
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

const form = document.getElementById("recruiterApplicationForm");
const submitButton = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");
const accountContext = document.getElementById("accountContext");
const pageTitle = document.getElementById("recruiterPageTitle");
const pageIntro = document.getElementById("recruiterPageIntro");
const layout = document.querySelector(".ra-layout");
const successPanel = document.getElementById("applicationSuccess");
const successMessage = document.getElementById("successMessage");
const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");
const email = document.getElementById("email");
const confirmEmail = document.getElementById("confirmEmail");
const soleProprietor = document.getElementById("soleProprietor");
const buildingNumberLabel = document.getElementById("buildingNumberLabel");
const registrationNumber = document.getElementById("companyRegistrationNumber");
const registrationRequired = document.getElementById("registrationRequired");
const registrationHint = document.getElementById("registrationHint");
const billingAddressSame = document.getElementById("billingAddressSame");
const billingAddressFields = document.getElementById("billingAddressFields");
const addressLookup = document.getElementById("addressLookup");
const addressMapLink = document.getElementById("addressMapLink");
const logoInput = document.getElementById("companyLogo");
const logoDropzone = document.getElementById("logoDropzone");
const logoPreview = document.getElementById("logoPreview");
const logoPlaceholder = document.getElementById("logoPlaceholder");
const logoFileName = document.getElementById("logoFileName");
const logoError = document.getElementById("logoError");
const removeLogoButton = document.getElementById("removeLogo");
const signInLink = document.querySelector(".ra-site-nav__signin");

const PASSWORD_RULES = {
  length: (value) => value.length >= 10,
  upper: (value) => /[A-Z]/.test(value),
  lower: (value) => /[a-z]/.test(value),
  number: (value) => /[0-9]/.test(value),
  special: (value) => /[^A-Za-z0-9]/.test(value),
};

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MIN_WIDTH = 400;
const LOGO_MIN_HEIGHT = 200;

let currentUser = null;
let authResolved = false;
let applicationBlocked = false;
let isSubmitting = false;
let createdAccountThisAttempt = false;
let selectedLogo = null;
let logoObjectUrl = "";
let formStarted = false;
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
  {city: "Queenstown", province: "Eastern Cape", country: "South Africa"},
  {city: "Bhisho", province: "Eastern Cape", country: "South Africa"},
  {city: "Polokwane", province: "Limpopo", country: "South Africa"},
  {city: "Tzaneen", province: "Limpopo", country: "South Africa"},
  {city: "Thohoyandou", province: "Limpopo", country: "South Africa"},
  {city: "Mokopane", province: "Limpopo", country: "South Africa"},
  {city: "Mbombela", province: "Mpumalanga", country: "South Africa"},
  {city: "Nelspruit", province: "Mpumalanga", country: "South Africa"},
  {city: "Witbank", province: "Mpumalanga", country: "South Africa"},
  {city: "Emalahleni", province: "Mpumalanga", country: "South Africa"},
  {city: "Secunda", province: "Mpumalanga", country: "South Africa"},
  {city: "Kimberley", province: "Northern Cape", country: "South Africa"},
  {city: "Upington", province: "Northern Cape", country: "South Africa"},
  {city: "Kuruman", province: "Northern Cape", country: "South Africa"},
  {city: "Rustenburg", province: "North West", country: "South Africa"},
  {city: "Mahikeng", province: "North West", country: "South Africa"},
  {city: "Klerksdorp", province: "North West", country: "South Africa"},
  {city: "Potchefstroom", province: "North West", country: "South Africa"},
  {city: "Mthatha", province: "Eastern Cape", country: "South Africa"},
  {city: "Bloemhof", province: "North West", country: "South Africa"},
  {city: "Gaborone", province: "South-East District", country: "Botswana"},
  {city: "Lobatse", province: "South-East District", country: "Botswana"},
  {city: "Windhoek", province: "Khomas", country: "Namibia"},
  {city: "Maseru", province: "Maseru", country: "Lesotho"},
  {city: "Mbabane", province: "Hhohho", country: "Eswatini"},
  {city: "Harare", province: "Harare", country: "Zimbabwe"},
];

function track(eventName, parameters = {}) {
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, {
      event_category: "recruiter_onboarding",
      ...parameters,
    });
  }
}

function value(id) {
  return String(document.getElementById(id)?.value || "").trim();
}

function setStatus(message, type = "error") {
  formStatus.textContent = message;
  formStatus.className = `ra-form-status is-${type}`;
  formStatus.hidden = !message;
  if (message) {
    formStatus.scrollIntoView({behavior: "smooth", block: "center"});
  }
}

function clearStatus() {
  formStatus.textContent = "";
  formStatus.className = "ra-form-status";
  formStatus.hidden = true;
}

function escapeSelectorValue(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/(["\\#.:,[\]>+~*=() ])/g, "\\$1");
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

function closeCitySuggestions(input) {
  const state = cityAutocompleteState.get(input.id);
  if (!state) return;
  state.panel.hidden = true;
  state.panel.replaceChildren();
  state.activeIndex = -1;
  input.setAttribute("aria-expanded", "false");
}

function applyCitySuggestion(input, suggestion) {
  const state = cityAutocompleteState.get(input.id);
  const scope = state?.scope || "main";
  input.value = suggestion.city;

  const provinceField = document.getElementById(scope === "billing" ? "billingProvince" : "province");
  const countryField = document.getElementById(scope === "billing" ? "billingCountry" : "country");

  if (provinceField) {
    if (provinceField.tagName === "SELECT") {
      const option = Array.from(provinceField.options).find((item) => item.value === suggestion.province || item.text === suggestion.province);
      provinceField.value = option ? option.value : suggestion.province;
    } else {
      provinceField.value = suggestion.province;
    }
    clearFieldError(provinceField);
  }

  if (countryField) {
    if (countryField.tagName === "SELECT") {
      const option = Array.from(countryField.options).find((item) => item.value === suggestion.country || item.text === suggestion.country);
      if (option) countryField.value = option.value;
    } else {
      countryField.value = suggestion.country;
    }
    clearFieldError(countryField);
  }

  clearFieldError(input);
  closeCitySuggestions(input);
}

function renderCitySuggestions(input, suggestions) {
  const state = cityAutocompleteState.get(input.id);
  if (!state) return;
  state.suggestions = suggestions;
  state.activeIndex = suggestions.length ? 0 : -1;
  state.panel.replaceChildren();

  if (!suggestions.length) {
    closeCitySuggestions(input);
    return;
  }

  suggestions.forEach((suggestion, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "ra-city-suggestion";
    if (index === state.activeIndex) option.classList.add("is-active");
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", index === state.activeIndex ? "true" : "false");
    option.innerHTML = `<strong>${suggestion.city}</strong><span>${placeLabel(suggestion)}</span>`;
    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      applyCitySuggestion(input, suggestion);
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

function syncCitySuggestions(input, openOnEmpty = false) {
  const term = input.value.trim();
  const suggestions = openOnEmpty && !term ? CITY_SUGGESTIONS.slice(0, 8) : queryCities(term);
  renderCitySuggestions(input, suggestions);
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

function setupCityAutocomplete(inputId, options = {}) {
  const input = document.getElementById(inputId);
  if (!(input instanceof HTMLInputElement)) return;

  const panel = document.getElementById(options.panelId);
  const toggle = document.querySelector(`[data-city-toggle="${escapeSelectorValue(inputId)}"]`);
  if (!panel || !toggle) return;

  cityAutocompleteState.set(inputId, {
    panel,
    toggle,
    scope: options.scope || "main",
    suggestions: [],
    activeIndex: -1,
  });

  input.addEventListener("input", () => syncCitySuggestions(input));
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) syncCitySuggestions(input);
  });
  input.addEventListener("keydown", (event) => {
    const state = cityAutocompleteState.get(inputId);
    if (!state) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (state.panel.hidden) {
        syncCitySuggestions(input, true);
        return;
      }
      moveCitySuggestion(input, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!state.panel.hidden) moveCitySuggestion(input, -1);
    } else if (event.key === "Enter") {
      if (!state.panel.hidden && state.suggestions[state.activeIndex]) {
        event.preventDefault();
        applyCitySuggestion(input, state.suggestions[state.activeIndex]);
      }
    } else if (event.key === "Escape") {
      closeCitySuggestions(input);
    }
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => closeCitySuggestions(input), 120);
  });

  toggle.addEventListener("click", () => {
    const state = cityAutocompleteState.get(inputId);
    if (!state) return;
    if (state.panel.hidden) {
      input.focus();
      syncCitySuggestions(input, true);
    } else {
      closeCitySuggestions(input);
    }
  });
}

function setAccountContext(message, link) {
  accountContext.replaceChildren();
  const textNode = document.createElement("span");
  textNode.textContent = message;
  accountContext.append(textNode);
  if (link) {
    accountContext.append(document.createTextNode(" "));
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.textContent = link.label;
    accountContext.append(anchor);
  }
  accountContext.hidden = false;
}

function clearAccountContext() {
  accountContext.replaceChildren();
  accountContext.hidden = true;
}

function updateSubmitAvailability() {
  submitButton.disabled = !authResolved || applicationBlocked || isSubmitting;
}

function splitName(displayName) {
  const parts = String(displayName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function prefill(id, candidate) {
  const field = document.getElementById(id);
  if (!field || field.value || candidate === undefined || candidate === null) return;
  field.value = String(candidate).trim();
}

async function configureAuthenticatedAccount(user) {
  pageTitle.textContent = "Complete Your Recruiter Account";
  pageIntro.textContent = "Confirm your company details below and send them to Career Unified for review.";
  document.querySelectorAll("[data-new-account-only]").forEach((element) => {
    element.hidden = true;
    element.querySelectorAll("input").forEach((input) => {
      input.required = false;
      input.setCustomValidity("");
    });
  });

  email.value = user.email || "";
  confirmEmail.value = user.email || "";
  email.readOnly = true;
  confirmEmail.readOnly = true;
  setAccountContext(`You are signed in as ${user.email || "a Career Unified user"}. This application will be linked to that account.`);

  try {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    const profile = userSnapshot.exists() ? userSnapshot.data() : {};
    const displayName = profile.fullName || profile.displayName || user.displayName || "";
    const names = splitName(displayName);

    prefill("firstName", profile.firstName || names.firstName);
    prefill("lastName", profile.lastName || names.lastName);
    prefill("contactNumber", profile.contactNumber || profile.phone || profile.phoneNumber);
    prefill("companyName", profile.companyName);
    prefill("companyWebsite", String(profile.companyWebsite || "").replace(/^https?:\/\//i, ""));

    const status = String(profile.recruiterStatus || "").toLowerCase();
    if (status === "pending") {
      applicationBlocked = true;
      setAccountContext(
        "Your recruiter application is already pending review.",
        {href: "/contact-us", label: "Contact us if your company details have changed."},
      );
    } else if (status === "approved") {
      applicationBlocked = true;
      setAccountContext(
        "Your recruiter account is already approved.",
        {href: "/recruiter-dashboard.html", label: "Open the recruiter dashboard."},
      );
    }
  } catch (error) {
    console.warn("RECRUITER_PROFILE_PREFILL_ERROR", error?.code || "unknown");
  }
}

function configureNewAccount() {
  pageTitle.textContent = "Create a Recruiter Account";
  pageIntro.textContent = "Please enter your details below. All fields marked with an asterisk (*) must be completed.";
  document.querySelectorAll("[data-new-account-only]").forEach((element) => {
    element.hidden = false;
    element.querySelectorAll("input").forEach((input) => {
      input.required = true;
    });
  });
  email.readOnly = false;
  confirmEmail.readOnly = false;
  applicationBlocked = false;
  clearAccountContext();
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  authResolved = false;
  applicationBlocked = false;
  try {
    if (user) {
      await configureAuthenticatedAccount(user);
    } else {
      configureNewAccount();
    }
  } finally {
    authResolved = true;
    updateSubmitAvailability();
  }
});

function passwordMeetsRequirements(candidate) {
  return Object.values(PASSWORD_RULES).every((test) => test(candidate));
}

function updatePasswordRules() {
  const candidate = password.value;
  Object.entries(PASSWORD_RULES).forEach(([name, test]) => {
    document.querySelector(`[data-password-rule="${name}"]`)?.classList.toggle("is-valid", test(candidate));
  });
}

function syncCrossFieldValidity() {
  const emailsMatch = email.value.trim().toLowerCase() === confirmEmail.value.trim().toLowerCase();
  confirmEmail.setCustomValidity(confirmEmail.value && !emailsMatch ? "Email addresses must match." : "");

  if (!currentUser) {
    password.setCustomValidity(
      password.value && !passwordMeetsRequirements(password.value)
        ? "Use at least 10 characters with uppercase, lowercase, a number, and a special character."
        : "",
    );
    confirmPassword.setCustomValidity(
      confirmPassword.value && password.value !== confirmPassword.value
        ? "Passwords must match."
        : "",
    );
  } else {
    password.setCustomValidity("");
    confirmPassword.setCustomValidity("");
  }
}

function validationMessage(field) {
  const label = form.querySelector(`label[for="${field.id}"]`)?.textContent.replace("*", "").trim() || "This field";
  if (field.validity.valueMissing) return `${label} is required.`;
  if (field.validity.typeMismatch) return `Enter a valid ${label.toLowerCase()}.`;
  if (field.validity.tooShort) return `${label} is too short.`;
  if (field.validity.tooLong) return `${label} is too long.`;
  if (field.validity.customError) return field.validationMessage;
  return `Check ${label.toLowerCase()} and try again.`;
}

function showFieldError(field) {
  if (!field?.id) return;
  const error = form.querySelector(`[data-error-for="${field.id}"]`);
  if (error) error.textContent = validationMessage(field);
  field.classList.add("is-invalid");
  field.closest(".ra-url-input")?.classList.add("is-invalid");
  field.setAttribute("aria-invalid", "true");
}

function clearFieldError(field) {
  if (!field?.id) return;
  const error = form.querySelector(`[data-error-for="${field.id}"]`);
  if (error) error.textContent = "";
  field.classList.remove("is-invalid");
  field.closest(".ra-url-input")?.classList.remove("is-invalid");
  field.removeAttribute("aria-invalid");
}

function renderInvalidFields() {
  form.querySelectorAll("input, select, textarea").forEach((field) => {
    if (!field.disabled && !field.validity.valid) showFieldError(field);
  });
}

function normalizeUrl(rawValue, fieldLabel) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname.includes(".")) {
      throw new Error("Invalid URL");
    }
    return parsed.toString();
  } catch {
    throw new Error(`Enter a valid ${fieldLabel}, such as www.example.co.za.`);
  }
}

function syncUrlValidity() {
  const fields = [
    ["companyWebsite", "company website"],
  ];
  for (const [id, label] of fields) {
    const field = document.getElementById(id);
    field.setCustomValidity("");
    if (!field.value.trim()) continue;
    try {
      normalizeUrl(field.value, label);
    } catch (error) {
      field.setCustomValidity(error.message);
    }
  }
}

function syncSoleProprietorState() {
  const isSoleProprietor = soleProprietor.checked;
  buildingNumberLabel.textContent = isSoleProprietor ? "House Number" : "Building Number";
  registrationNumber.required = !isSoleProprietor;
  registrationRequired.hidden = isSoleProprietor;
  registrationHint.textContent = isSoleProprietor
    ? "Optional for sole proprietors."
    : "Required unless you are applying as a sole proprietor.";
  if (isSoleProprietor) {
    registrationNumber.setCustomValidity("");
    clearFieldError(registrationNumber);
  }
}

function syncBillingAddressState() {
  const sameAddress = billingAddressSame.checked;
  billingAddressFields.hidden = sameAddress;
  billingAddressFields.querySelectorAll("[data-billing-required]").forEach((field) => {
    field.disabled = sameAddress;
    field.required = !sameAddress;
    if (sameAddress) {
      field.setCustomValidity("");
      clearFieldError(field);
    }
  });
}

function updateAddressMapLink() {
  const query = addressLookup.value.trim();
  addressMapLink.href = query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "https://www.google.com/maps/search/?api=1";
  addressMapLink.setAttribute("aria-disabled", String(!query));
}

function clearLogoSelection() {
  selectedLogo = null;
  logoInput.value = "";
  logoError.textContent = "";
  logoFileName.textContent = "No file selected";
  logoPreview.hidden = true;
  logoPreview.removeAttribute("src");
  logoPlaceholder.hidden = false;
  removeLogoButton.hidden = true;
  if (logoObjectUrl) {
    URL.revokeObjectURL(logoObjectUrl);
    logoObjectUrl = "";
  }
}

function imageDimensions(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = {width: image.naturalWidth, height: image.naturalHeight};
      URL.revokeObjectURL(objectUrl);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be read."));
    };
    image.src = objectUrl;
  });
}

async function selectLogo(file) {
  clearLogoSelection();
  if (!file) return;
  if (!LOGO_TYPES.has(file.type)) {
    logoError.textContent = "Choose a PNG, JPG, or WebP image.";
    return;
  }
  if (file.size > LOGO_MAX_BYTES) {
    logoError.textContent = "The company logo must be smaller than 2MB.";
    return;
  }

  try {
    const dimensions = await imageDimensions(file);
    if (dimensions.width < LOGO_MIN_WIDTH || dimensions.height < LOGO_MIN_HEIGHT) {
      logoError.textContent = `The logo must be at least ${LOGO_MIN_WIDTH} x ${LOGO_MIN_HEIGHT} pixels. This image is ${dimensions.width} x ${dimensions.height}.`;
      return;
    }

    selectedLogo = file;
    logoObjectUrl = URL.createObjectURL(file);
    logoPreview.src = logoObjectUrl;
    logoPreview.hidden = false;
    logoPlaceholder.hidden = true;
    removeLogoButton.hidden = false;
    logoFileName.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
    logoError.textContent = "";
    track("recruiter_logo_selected", {file_type: file.type});
  } catch (error) {
    logoError.textContent = error.message || "The selected image could not be read.";
  }
}

async function uploadLogo(user) {
  if (!selectedLogo) return {logoUrl: "", logoPath: ""};

  const token = await getIdToken(user, true);
  const body = new FormData();
  body.append("logo", selectedLogo, selectedLogo.name);
  const response = await fetch("/.netlify/functions/upload-recruiter-application-logo", {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`},
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "The company logo could not be uploaded. Please try again.");
  }
  return {
    logoUrl: String(payload.logoUrl || ""),
    logoPath: String(payload.logoPath || ""),
  };
}

function mainAddress() {
  return {
    buildingNumber: value("buildingNumber"),
    street: value("street"),
    suburb: value("suburb"),
    city: value("city"),
    province: value("province"),
    country: value("country"),
    postcode: value("postcode"),
  };
}

function billingAddress(address) {
  if (billingAddressSame.checked) return {...address};
  return {
    buildingNumber: value("billingBuildingNumber"),
    street: value("billingStreet"),
    suburb: value("billingSuburb"),
    city: value("billingCity"),
    province: value("billingProvince"),
    country: value("billingCountry"),
    postcode: value("billingPostcode"),
  };
}

function setLoading(loading) {
  isSubmitting = loading;
  submitButton.classList.toggle("is-loading", loading);
  submitButton.querySelector("span").textContent = loading ? "Submitting application" : "Submit recruiter application";
  updateSubmitAvailability();
}

function friendlySubmissionError(error) {
  const code = String(error?.code || "");
  if (code.includes("email-already-in-use")) {
    return "An account already uses this email address. Sign in first, then return to complete the recruiter application.";
  }
  if (code.includes("weak-password")) {
    return "Choose a stronger password with at least 10 characters, uppercase, lowercase, a number, and a special character.";
  }
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("network-request-failed")) return "The network connection was interrupted. Check your connection and try again.";
  if (code.includes("permission-denied")) return "The application could not be saved. Please sign in again and retry.";
  if (createdAccountThisAttempt) {
    return `${error?.message || "The application could not be completed."} Your account was created, so you can retry without creating another one.`;
  }
  return error?.message || "The recruiter application could not be submitted. Please try again.";
}

async function submitApplication(event) {
  event.preventDefault();
  if (isSubmitting) return;
  clearStatus();
  syncCrossFieldValidity();
  syncUrlValidity();
  syncSoleProprietorState();
  syncBillingAddressState();
  renderInvalidFields();

  if (!form.checkValidity()) {
    const firstInvalid = form.querySelector(":invalid");
    firstInvalid?.focus({preventScroll: true});
    firstInvalid?.scrollIntoView({behavior: "smooth", block: "center"});
    setStatus("Please check the highlighted fields before submitting.");
    track("recruiter_application_validation_error");
    return;
  }
  if (!authResolved) {
    setStatus("Account verification is still loading. Please wait a moment and try again.");
    return;
  }
  if (applicationBlocked) {
    setStatus("This account already has a recruiter application or approved recruiter access.");
    return;
  }

  setLoading(true);
  createdAccountThisAttempt = false;
  track("recruiter_application_submit", {account_type: currentUser ? "existing" : "new"});

  try {
    let user = currentUser;
    if (!user) {
      const credential = await createUserWithEmailAndPassword(auth, email.value.trim(), password.value);
      user = credential.user;
      currentUser = user;
      createdAccountThisAttempt = true;
      await updateProfile(user, {displayName: `${value("firstName")} ${value("lastName")}`.trim()});
    }

    const website = normalizeUrl(value("companyWebsite"), "company website");
    const logo = await uploadLogo(user);
    const address = mainAddress();
    const invoiceAddress = billingAddress(address);
    const applicationRef = doc(collection(db, "recruiterApplications"));
    const userRef = doc(db, "users", user.uid);
    const batch = writeBatch(db);

    batch.set(applicationRef, {
      userId: user.uid,
      email: user.email || email.value.trim(),
      firstName: value("firstName"),
      lastName: value("lastName"),
      fullName: `${value("firstName")} ${value("lastName")}`.trim(),
      contactNumber: value("contactNumber"),
      recruitmentAgency: document.getElementById("recruitmentAgency").checked,
      companyName: value("companyName"),
      companyWebsite: website,
      companyLogoUrl: logo.logoUrl,
      companyLogoPath: logo.logoPath,
      soleProprietor: soleProprietor.checked,
      companyRegistrationNumber: value("companyRegistrationNumber"),
      address,
      billingAddressSame: billingAddressSame.checked,
      billingAddress: invoiceAddress,
      reason: value("reason"),
      recruiterTermsAccepted: true,
      termsAcceptedAt: serverTimestamp(),
      applicationVersion: 2,
      status: "pending",
      submittedAt: serverTimestamp(),
    });

    const userData = {
      firstName: value("firstName"),
      lastName: value("lastName"),
      fullName: `${value("firstName")} ${value("lastName")}`.trim(),
      contactNumber: value("contactNumber"),
      role: "recruiter",
      recruiterStatus: "pending",
      recruiterApplicationId: applicationRef.id,
      companyName: value("companyName"),
      companyWebsite: website,
      email: user.email || email.value.trim(),
      updatedAt: serverTimestamp(),
    };
    if (createdAccountThisAttempt) userData.createdAt = serverTimestamp();
    batch.set(userRef, userData, {merge: true});
    await batch.commit();

    let verificationSent = false;
    if (!user.emailVerified) {
      try {
        await sendEmailVerification(user);
        verificationSent = true;
      } catch (verificationError) {
        console.warn("RECRUITER_EMAIL_VERIFICATION_ERROR", verificationError?.code || "unknown");
      }
    }

    layout.hidden = true;
    successMessage.textContent = verificationSent
      ? "Thank you. We will review your company information and have sent an email verification link to your address."
      : "Thank you. We will review your company information and contact you using the email address provided.";
    successPanel.hidden = false;
    successPanel.scrollIntoView({behavior: "smooth", block: "start"});
    track("recruiter_application_success", {
      account_type: createdAccountThisAttempt ? "new" : "existing",
      logo_uploaded: Boolean(logo.logoUrl),
      recruitment_agency: document.getElementById("recruitmentAgency").checked,
    });
  } catch (error) {
    console.error("RECRUITER_APPLICATION_ERROR", error?.code || error?.message || "unknown");
    setStatus(friendlySubmissionError(error));
    track("recruiter_application_error", {error_code: String(error?.code || "unknown").slice(0, 80)});
  } finally {
    setLoading(false);
  }
}

form.addEventListener("submit", submitApplication);
form.addEventListener("invalid", (event) => showFieldError(event.target), true);
form.addEventListener("input", (event) => {
  if (event.target.matches("input, select, textarea")) {
    event.target.setCustomValidity("");
    clearFieldError(event.target);
    if ([email, confirmEmail, password, confirmPassword].includes(event.target)) {
      syncCrossFieldValidity();
    }
    if (event.target === password) updatePasswordRules();
    if (event.target === document.getElementById("companyWebsite")) {
      syncUrlValidity();
    }
  }
});
form.addEventListener("change", (event) => {
  if (event.target.matches("input, select, textarea")) clearFieldError(event.target);
});
form.addEventListener("focusin", () => {
  if (!formStarted) {
    formStarted = true;
    track("recruiter_application_start");
  }
});

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const field = document.getElementById(button.dataset.passwordToggle);
    const show = field.type === "password";
    field.type = show ? "text" : "password";
    button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    button.querySelector("i").className = show ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
  });
});

soleProprietor.addEventListener("change", syncSoleProprietorState);
billingAddressSame.addEventListener("change", syncBillingAddressState);
addressLookup.addEventListener("input", updateAddressMapLink);
addressMapLink.addEventListener("click", (event) => {
  updateAddressMapLink();
  if (!addressLookup.value.trim()) {
    event.preventDefault();
    addressLookup.focus();
  }
});
logoInput.addEventListener("change", () => selectLogo(logoInput.files?.[0]));
removeLogoButton.addEventListener("click", clearLogoSelection);
signInLink.addEventListener("click", () => {
  sessionStorage.setItem("careerUnifiedReturnUrl", "/recruiter-apply.html");
});

["dragenter", "dragover"].forEach((eventName) => {
  logoDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    logoDropzone.classList.add("is-dragging");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  logoDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    logoDropzone.classList.remove("is-dragging");
  });
});
logoDropzone.addEventListener("drop", (event) => selectLogo(event.dataTransfer?.files?.[0]));

window.addEventListener("beforeunload", () => {
  if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
});

syncSoleProprietorState();
syncBillingAddressState();
updateAddressMapLink();
updatePasswordRules();
setupCityAutocomplete("city", {panelId: "citySuggestions", scope: "main"});
setupCityAutocomplete("billingCity", {panelId: "billingCitySuggestions", scope: "billing"});
