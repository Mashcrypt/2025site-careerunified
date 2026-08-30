import type {Handler} from "@netlify/functions";
import crypto from "crypto";
import {getAdmin} from "./_firebaseAdmin";
import {checkRateLimit} from "./_rateLimit";
import {
  ApplicationError,
  bearerToken,
  cleanMultiline,
  cleanText,
  corsHeaders,
  hasAnswer,
  json,
  normalizeAnswer,
  parseJsonBody,
  safeFilename,
  storagePathFromCv,
} from "./_applicationUtils";
import {copyPrivateCv, deletePrivateCv, savePrivateCv} from "./_privateCvStore";
import {sendTransactionalEmail} from "./_notify";
import {enqueuePartnerWebhook} from "./_partnerWebhooks";
import {buildProfileCvPdf} from "./_profileCvPdf";
import {countryNameForCode, normalizeCountryCode} from "./_countryOptions";

type ScreeningQuestion = {
  id: string;
  label: string;
  templateKey?: string;
  type: string;
  required: boolean;
  options: string[];
  criteria?: {operator?: string; value?: unknown};
};

class DuplicateApplicationError extends ApplicationError {
  applicationId: string;
  status: string;

  constructor(applicationId: string, status = "submitted") {
    super(409, "You have already applied for this job.");
    this.applicationId = applicationId;
    this.status = cleanText(status || "submitted", 40);
  }
}

const SENSITIVE_SCREENING_PATTERN =
  /\b(?:id|identity|passport|visa)\s*(?:number|no\.?)\b|\b(?:race|ethnicity|gender|sex|medical|health|disability|bank details?|salary history|current salary|photo|picture|criminal record)\b/i;
const GENDER_OPTIONS = new Set([
  "Female",
  "Male",
  "Non-binary",
  "Another gender",
  "Prefer not to say",
]);
const LEGACY_WORK_AUTHORISATION_QUESTION = "Are you legally authorised to work in South Africa?";
const GENERIC_WORK_AUTHORISATION_QUESTION =
  "Are you legally authorised to work in the country where this position is based?";
const RELATIVES_IN_ORGANISATION_TEMPLATE = "relatives_in_organisation";
const RELATIVE_DETAIL_TEMPLATE_KEYS = new Set(["relative_full_name", "relative_relationship"]);
const EMPLOYMENT_EQUITY_TEMPLATE = "employment_equity_self_identification";
const EMPLOYMENT_EQUITY_OPTIONS = ["Black African", "Coloured", "Indian or Asian", "White", "Other"];
const EMPLOYMENT_EQUITY_LABEL = "For employment equity reporting, how do you voluntarily self-identify?";
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

function applicationIdFor(jobId: string, candidateId: string) {
  return crypto.createHash("sha256").update(`${jobId}:${candidateId}`).digest("hex").slice(0, 48);
}

function escapeEmailHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function siteOrigin() {
  const configuredUrl = cleanText(process.env.URL || process.env.SITE_URL, 500);
  try {
    const parsed = new URL(configuredUrl);
    if (["http:", "https:"].includes(parsed.protocol)) return parsed.origin;
  } catch {
    // Fall through to the canonical production URL.
  }
  return "https://careerunified.com";
}

function candidateFirstName(fullName: string) {
  return cleanText(fullName.split(/\s+/)[0], 60) || "there";
}

function applicationConfirmationEmail({
  fullName,
  jobTitle,
  companyName,
  applicationId,
  submittedAt,
}: {
  fullName: string;
  jobTitle: string;
  companyName: string;
  applicationId: string;
  submittedAt: Date;
}) {
  const firstName = candidateFirstName(fullName);
  const applicationsUrl = new URL("/account-page.html?tab=applications", siteOrigin()).toString();
  const submittedDate = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "long",
    timeZone: "Africa/Johannesburg",
  }).format(submittedAt);
  const subject = `Application received: ${jobTitle}`;
  const text = `Hi ${firstName},

Thank you for applying for ${jobTitle} at ${companyName} through Career Unified. We have successfully received your application and securely shared it with the recruiter.

Application details
Job: ${jobTitle}
Company: ${companyName}
Submitted: ${submittedDate}
Reference: ${applicationId}

You can follow your progress from Profile > My Applications. If you need to review your submission, withdraw it, or make any available changes, open My Applications here:
${applicationsUrl}

The recruiter will contact you directly or update your application when there is news. You do not need to submit another application for this vacancy.

Good luck with your application.

Career Unified`;
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;color:#14213d;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your application for ${escapeEmailHtml(jobTitle)} was received successfully.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dce5f2;">
          <tr><td style="padding:24px 30px;border-bottom:1px solid #e5eaf2;font-size:22px;font-weight:700;color:#173b8f;">Career Unified</td></tr>
          <tr><td style="padding:32px 30px;">
            <p style="margin:0 0 10px;color:#2864dc;font-size:13px;font-weight:700;text-transform:uppercase;">Application received</p>
            <h1 style="margin:0 0 18px;font-size:28px;line-height:1.25;color:#101828;">Thank you for applying, ${escapeEmailHtml(firstName)}</h1>
            <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#475467;">We have successfully received your application and securely shared it with the recruiter.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f7f9fc;border:1px solid #dce5f2;">
              <tr><td style="padding:20px;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#667085;text-transform:uppercase;">Position</p>
                <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#173b8f;">${escapeEmailHtml(jobTitle)}</p>
                <p style="margin:0 0 6px;color:#475467;"><strong>Company:</strong> ${escapeEmailHtml(companyName)}</p>
                <p style="margin:0 0 6px;color:#475467;"><strong>Submitted:</strong> ${escapeEmailHtml(submittedDate)}</p>
                <p style="margin:0;color:#475467;"><strong>Reference:</strong> ${escapeEmailHtml(applicationId)}</p>
              </td></tr>
            </table>
            <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#475467;">Follow your progress from <strong>Profile &gt; My Applications</strong>. You can also review your submission, withdraw it, or make any available changes there.</p>
            <p style="margin:0 0 24px;"><a href="${escapeEmailHtml(applicationsUrl)}" style="display:inline-block;background:#2864dc;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;">View My Applications</a></p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#667085;">The recruiter will contact you directly or update your application when there is news. You do not need to apply again for this vacancy.</p>
            <p style="margin:24px 0 0;font-size:16px;color:#344054;">Good luck with your application.<br><strong>Career Unified</strong></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return {subject, text, html};
}

function isActiveJob(job: Record<string, any>) {
  const status = cleanText(job.status || "active").toLowerCase();
  if (job.draft || ["draft", "closed", "removed", "deleted", "rejected"].includes(status)) return false;
  if (!job.deadline) return true;

  const deadline = new Date(job.deadline);
  if (Number.isNaN(deadline.getTime())) return true;
  deadline.setHours(23, 59, 59, 999);
  return deadline.getTime() >= Date.now();
}

function normalizeQuestions(value: unknown, jobCountry = ""): ScreeningQuestion[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 8).map((question: any, index) => {
    const id = cleanText(question?.id || `question_${index + 1}`, 80);
    const type = ["yes_no", "number", "single_select", "multi_select", "short_text"].includes(question?.type)
      ? question.type
      : "short_text";
    const options = Array.isArray(question?.options)
      ? question.options.map((option: unknown) => cleanText(option, 120)).filter(Boolean).slice(0, 12)
      : [];
    const rawLabel = cleanText(question?.label, 240);
    const requestedTemplateKey = cleanText(question?.templateKey, 80);
    const templateKey = SCREENING_TEMPLATE_KEYS.has(requestedTemplateKey)
      ? requestedTemplateKey
      : rawLabel === LEGACY_WORK_AUTHORISATION_QUESTION || rawLabel === GENERIC_WORK_AUTHORISATION_QUESTION
        ? "work_authorisation"
        : undefined;
    const isWorkAuthorisation = templateKey === "work_authorisation"
      || rawLabel === LEGACY_WORK_AUTHORISATION_QUESTION
      || rawLabel === GENERIC_WORK_AUTHORISATION_QUESTION;
    const isEmploymentEquity = templateKey === EMPLOYMENT_EQUITY_TEMPLATE;

    return {
      id,
      label: isWorkAuthorisation
        ? jobCountry
          ? `Are you legally authorised to work in ${jobCountry}?`
          : GENERIC_WORK_AUTHORISATION_QUESTION
        : isEmploymentEquity
          ? EMPLOYMENT_EQUITY_LABEL
          : rawLabel,
      templateKey: isWorkAuthorisation ? "work_authorisation" : templateKey,
      type: isEmploymentEquity ? "single_select" : type,
      required: isEmploymentEquity ? false : Boolean(question?.required),
      options: isEmploymentEquity ? [...EMPLOYMENT_EQUITY_OPTIONS] : options,
      criteria: !isEmploymentEquity && question?.criteria && typeof question.criteria === "object"
        ? {
            operator: cleanText(question.criteria.operator, 20),
            value: normalizeAnswer(question.criteria.value),
          }
        : undefined,
    };
  }).filter((question) =>
    question.id &&
    question.label &&
    (question.templateKey === EMPLOYMENT_EQUITY_TEMPLATE || !SENSITIVE_SCREENING_PATTERN.test(question.label))
  );
}

function normalizeNumericAnswer(value: unknown, questionLabel: string) {
  const answer = normalizeAnswer(value);
  if (!hasAnswer(answer)) return "";
  if (typeof answer !== "string" || !/^\d{1,12}$/.test(answer)) {
    throw new ApplicationError(400, `Use numbers only for: ${questionLabel}`);
  }
  return answer;
}

function answerMatches(question: ScreeningQuestion, answer: unknown) {
  const operator = question.criteria?.operator;
  const expected = question.criteria?.value;
  if (!operator || !hasAnswer(expected)) return null;

  if (operator === "gte") {
    const actualNumber = Number(Array.isArray(answer) ? answer[0] : answer);
    const expectedNumber = Number(Array.isArray(expected) ? expected[0] : expected);
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
    return actualNumber >= expectedNumber;
  }

  const actualValues = (Array.isArray(answer) ? answer : [answer])
    .map((item) => cleanText(item, 200).toLowerCase());
  const expectedValue = cleanText(Array.isArray(expected) ? expected[0] : expected, 200).toLowerCase();
  return actualValues.includes(expectedValue);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function logCvFallback(stage: string, error: unknown) {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  console.warn("DIRECT_APPLY_CV_FALLBACK", {stage, errorName});
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 200, headers: corsHeaders(origin), body: ""};
  }
  if (event.httpMethod !== "POST") {
    return json(405, origin, {error: "Method Not Allowed"});
  }

  let copiedCvPath = "";
  let copiedCvBlobKey = "";
  let applicationCreated = false;
  let failureStage = "initialization";

  try {
    const admin = getAdmin();
    failureStage = "authentication";
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please log in before applying.");

    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please log in again.");
    }

    failureStage = "rate_limit";
    const rateLimit = await checkRateLimit({
      admin,
      action: "direct-job-application",
      identifier: `uid:${decoded.uid}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {
          error: "Too many applications were submitted recently. Please try again later.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    failureStage = "request_validation";
    const body = parseJsonBody(event);
    const jobId = cleanText(body.jobId, 160);
    const cvId = cleanText(body.cvId, 180);
    if (!jobId) throw new ApplicationError(400, "A valid job is required.");
    if (!cvId) throw new ApplicationError(400, "Please select or upload a CV.");
    if (body.privacyAccepted !== true || body.termsAccepted !== true) {
      throw new ApplicationError(400, "Please accept the Privacy Policy and Terms and Conditions.");
    }

    const db = admin.firestore();
    failureStage = "application_context";
    const [jobSnap, userSnap, cvSnap] = await Promise.all([
      db.doc(`jobs/${jobId}`).get(),
      db.doc(`users/${decoded.uid}`).get(),
      db.doc(`cvs/${cvId}`).get(),
    ]);

    if (!jobSnap.exists) throw new ApplicationError(404, "This job is no longer available.");
    const job = jobSnap.data() || {};
    if (cleanText(job.applicationMethod).toLowerCase() !== "direct") {
      throw new ApplicationError(400, "This employer is not accepting direct applications on Career Unified.");
    }
    if (!isActiveJob(job)) throw new ApplicationError(410, "Applications for this job are closed.");

    const recruiterId = cleanText(job.recruiterId, 160);
    if (!recruiterId) throw new ApplicationError(400, "This job is missing recruiter information.");

    if (!cvSnap.exists) throw new ApplicationError(404, "The selected CV could not be found.");
    const cv = cvSnap.data() || {};
    if (cv.userId !== decoded.uid) throw new ApplicationError(403, "You can only submit your own CV.");
    if (cleanText(cv.status || "active").toLowerCase() !== "active") {
      throw new ApplicationError(400, "The selected CV is not active.");
    }

    const profile = userSnap.data() || {};
    const contact = body.contact && typeof body.contact === "object" ? body.contact : {};
    const fullName = cleanText(contact.fullName || profile.name || decoded.name, 120);
    const email = cleanText(decoded.email || profile.email, 180).toLowerCase();
    const phone = cleanText(contact.phone || profile.phone, 40);
    const city = cleanText(contact.city || profile.city, 80);
    const province = cleanText(contact.province || profile.province, 80);
    const location = cleanText(contact.location || [city, province].filter(Boolean).join(", ") || profile.location, 160);
    const qualification = cleanText(contact.qualification || profile.degreeType, 160);
    const nationalityCodeSource = Object.prototype.hasOwnProperty.call(contact, "nationalityCode")
      ? contact.nationalityCode
      : profile.nationalityCode;
    const suppliedNationalityCode = cleanText(nationalityCodeSource, 4).toUpperCase();
    const nationalityCode = normalizeCountryCode(suppliedNationalityCode);
    const suppliedNationality = cleanText(contact.nationality, 100);
    if ((suppliedNationalityCode && !nationalityCode) || (suppliedNationality && !nationalityCode)) {
      throw new ApplicationError(400, "Choose a valid nationality from the suggestions.");
    }
    const nationality = countryNameForCode(nationalityCode);
    const genderSource = Object.prototype.hasOwnProperty.call(contact, "gender")
      ? contact.gender
      : profile.gender;
    const suppliedGender = cleanText(genderSource, 80);
    if (suppliedGender && !GENDER_OPTIONS.has(suppliedGender)) {
      throw new ApplicationError(400, "Select a valid gender option.");
    }
    const gender = GENDER_OPTIONS.has(suppliedGender) ? suppliedGender : "";
    const currentJobTitle = cleanText(profile.currentJobTitle, 160);
    const yearsOfExperience = cleanText(profile.yearsOfExperience, 80);
    const profilePhotoURL = cleanText(profile.profilePhotoURL, 1200);

    if (!fullName || !phone || !location) {
      throw new ApplicationError(400, "Name, telephone, and location are required.");
    }
    if (!isEmail(email)) {
      throw new ApplicationError(
        400,
        "Add a valid email address to your Career Unified account before applying.",
      );
    }

    const questions = normalizeQuestions(job.screeningQuestions, cleanText(job.country, 120));
    const suppliedAnswers = body.answers && typeof body.answers === "object" ? body.answers : {};
    const relativesQuestion = questions.find(
      (question) => question.templateKey === RELATIVES_IN_ORGANISATION_TEMPLATE,
    );
    const relativesAnswer = relativesQuestion
      ? normalizeAnswer(suppliedAnswers[relativesQuestion.id])
      : "";
    const answers = questions.map((question) => {
      const isConditionalRelativeDetail = RELATIVE_DETAIL_TEMPLATE_KEYS.has(question.templateKey || "");
      const shouldIncludeQuestion = !isConditionalRelativeDetail || relativesAnswer === "Yes";
      const answer = shouldIncludeQuestion
        ? question.type === "number"
          ? normalizeNumericAnswer(suppliedAnswers[question.id], question.label)
          : normalizeAnswer(suppliedAnswers[question.id])
        : "";
      if (shouldIncludeQuestion && question.required && !hasAnswer(answer)) {
        throw new ApplicationError(400, `Please answer: ${question.label}`);
      }
      if (
        shouldIncludeQuestion &&
        ["single_select", "multi_select"].includes(question.type) &&
        hasAnswer(answer) &&
        question.options.length
      ) {
        const selectedAnswers = Array.isArray(answer) ? answer : [answer];
        const allowedOptions = new Set(question.options.map((option) => option.toLowerCase()));
        const validShape = question.type === "multi_select" ? Array.isArray(answer) : selectedAnswers.length === 1;
        if (!validShape || !selectedAnswers.every((value) => allowedOptions.has(cleanText(value, 200).toLowerCase()))) {
          throw new ApplicationError(400, `Select a valid answer for: ${question.label}`);
        }
      }
      return {
        questionId: question.id,
        templateKey: question.templateKey || "",
        label: question.label,
        type: question.type,
        answer,
        visibleToCandidate: shouldIncludeQuestion,
        essentialMatch: answerMatches(question, answer),
      };
    }).filter((answer) => answer.visibleToCandidate);

    const noticePeriodAnswer = answers.find((answer) => answer.templateKey === "notice_period")?.answer;
    const noticePeriod = Array.isArray(noticePeriodAnswer)
      ? noticePeriodAnswer.join(", ")
      : noticePeriodAnswer;
    const availability = cleanText(
      profile.availability || cv.data?.availability || noticePeriod,
      80,
    );

    const essentialAnswers = answers.filter((answer) => answer.essentialMatch !== null);
    const essentialMatched = essentialAnswers.filter((answer) => answer.essentialMatch === true).length;
    const screeningResult = essentialAnswers.length === 0
      ? "review"
      : essentialMatched === essentialAnswers.length
        ? "meets_essentials"
        : "review_required";

    const applicationId = applicationIdFor(jobId, decoded.uid);
    const applicationRef = db.doc(`applications/${applicationId}`);
    const existingApplication = await applicationRef.get();
    if (existingApplication.exists) {
      throw new DuplicateApplicationError(
        applicationId,
        existingApplication.data()?.status,
      );
    }

    failureStage = "cv_snapshot";
    const sourceCvPath = storagePathFromCv(cv);
    const sourceCvBlobKey = cleanText(cv.blobKey, 800);
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
    const bucket = admin.storage().bucket(bucketName);
    let cvFileName = safeFilename(cv.cvFileName || `${fullName}-CV.pdf`);
    const cvSnapshotId = crypto.randomUUID();
    let cvContentType = cleanText(cv.contentType, 120) || "application/octet-stream";
    let cvSize = Number(cv.size || 0);
    let generatedFromProfile = false;
    let cvSnapshotPath = "";
    let cvSnapshotBlobKey = "";
    let cvStorageProvider: "firebase" | "netlify_blobs" = "netlify_blobs";
    const destinationBlobKey = `applications/${recruiterId}/${jobId}/${decoded.uid}/${applicationId}_${cvSnapshotId}`;
    const destinationStoragePath = () =>
      `applications/${recruiterId}/${jobId}/${decoded.uid}/${applicationId}_${cvSnapshotId}_${cvFileName}`;

    const createProfileCvFallback = async () => {
      const fallbackBuffer = await buildProfileCvPdf({
        fullName,
        email,
        phone,
        location,
        qualification,
        currentJobTitle,
        currentCompany: cleanText(profile.currentCompany, 160),
        yearsOfExperience,
        institutionName: cleanText(profile.institutionName, 180),
        fieldOfStudy: cleanText(profile.fieldOfStudy, 180),
        graduationYear: cleanText(profile.graduationYear, 40),
        industry: cleanText(profile.industry, 120),
        summary: cleanMultiline(profile.bio || profile.summary, 1600),
        skills: profile.skills,
        homeLanguages: profile.homeLanguages,
      });
      cvFileName = safeFilename(`${fullName}-CV.pdf`);
      cvContentType = "application/pdf";
      cvSize = fallbackBuffer.length;
      generatedFromProfile = true;
      return fallbackBuffer;
    };

    const saveBufferToBlob = async (buffer: Buffer) => {
      copiedCvBlobKey = destinationBlobKey;
      try {
        await savePrivateCv(destinationBlobKey, buffer, {
          candidateId: decoded.uid,
          recruiterId,
          jobId,
          applicationId,
          contentType: cvContentType,
          fileName: cvFileName,
          generatedFromProfile,
        });
      } catch (error) {
        copiedCvBlobKey = "";
        throw error;
      }
      cvSnapshotBlobKey = destinationBlobKey;
      cvStorageProvider = "netlify_blobs";
    };

    const saveBufferToFirebase = async (buffer: Buffer) => {
      const storagePath = destinationStoragePath();
      copiedCvPath = storagePath;
      try {
        await bucket.file(storagePath).save(buffer, {
          resumable: false,
          metadata: {
            contentType: cvContentType,
            cacheControl: "private, max-age=0, no-store",
            metadata: {
              candidateId: decoded.uid,
              recruiterId,
              jobId,
              applicationId,
            },
          },
        });
      } catch (error) {
        copiedCvPath = "";
        throw error;
      }
      cvSnapshotPath = storagePath;
      cvStorageProvider = "firebase";
    };

    if (sourceCvBlobKey) {
      copiedCvBlobKey = destinationBlobKey;
      try {
        const copied = await copyPrivateCv(sourceCvBlobKey, destinationBlobKey, {
          candidateId: decoded.uid,
          recruiterId,
          jobId,
          applicationId,
          contentType: cvContentType,
          fileName: cvFileName,
        });
        if (copied) {
          cvSnapshotBlobKey = destinationBlobKey;
          cvStorageProvider = "netlify_blobs";
        } else {
          copiedCvBlobKey = "";
        }
      } catch (error) {
        copiedCvBlobKey = "";
        logCvFallback("copy_blob", error);
      }
    }

    let sourceBuffer: Buffer | null = null;
    if (!cvSnapshotBlobKey && sourceCvPath) {
      try {
        [sourceBuffer] = await bucket.file(sourceCvPath).download();
        cvSize = sourceBuffer.length;
        await saveBufferToBlob(sourceBuffer);
      } catch (error) {
        logCvFallback("firebase_to_blob", error);
      }
    }

    if (!cvSnapshotBlobKey && !cvSnapshotPath && sourceCvPath) {
      try {
        if (!sourceBuffer) [sourceBuffer] = await bucket.file(sourceCvPath).download();
        cvSize = sourceBuffer.length;
        await saveBufferToFirebase(sourceBuffer);
      } catch (error) {
        logCvFallback("copy_firebase", error);
      }
    }

    if (!cvSnapshotBlobKey && !cvSnapshotPath) {
      try {
        const fallbackBuffer = await createProfileCvFallback();
        try {
          await saveBufferToBlob(fallbackBuffer);
        } catch (error) {
          logCvFallback("profile_to_blob", error);
          await saveBufferToFirebase(fallbackBuffer);
        }
      } catch (error) {
        logCvFallback("profile_cv", error);
      }
    }

    // Keep Direct Apply available during a storage-provider incident. These
    // references remain private and are served to recruiters by an authenticated
    // function; no public CV URL is exposed.
    if (!cvSnapshotBlobKey && !cvSnapshotPath && sourceCvBlobKey) {
      cvSnapshotBlobKey = sourceCvBlobKey;
      cvStorageProvider = "netlify_blobs";
    } else if (!cvSnapshotBlobKey && !cvSnapshotPath && sourceCvPath) {
      cvSnapshotPath = sourceCvPath;
      cvStorageProvider = "firebase";
    }

    if (!cvSnapshotBlobKey && !cvSnapshotPath) {
      throw new ApplicationError(
        503,
        "We could not securely attach your CV. Please upload the CV again and retry.",
      );
    }

    failureStage = "application_write";
    const now = admin.firestore.Timestamp.now();
    const application = {
      applicationId,
      jobId,
      recruiterId,
      candidateId: decoded.uid,
      status: "submitted",
      screeningResult,
      screeningSummary: {
        totalQuestions: questions.length,
        answeredQuestions: answers.filter((answer) => hasAnswer(answer.answer)).length,
        essentialTotal: essentialAnswers.length,
        essentialMatched,
      },
      candidateSnapshot: {
        fullName,
        email,
        phone,
        location,
        city,
        province,
        nationality,
        nationalityCode,
        qualification,
        gender,
        currentJobTitle,
        yearsOfExperience,
        availability,
        profilePhotoURL,
      },
      jobSnapshot: {
        title: cleanText(job.title || job.jobTitle, 200),
        company: cleanText(job.company || job.companyName, 160),
        location: cleanText(job.location || [job.city, job.country].filter(Boolean).join(", "), 160),
        slug: cleanText(job.slug, 220),
        deadline: cleanText(job.deadline, 80),
      },
      cvSnapshot: {
        cvId,
        fileName: cvFileName,
        storagePath: cvSnapshotPath,
        blobKey: cvSnapshotBlobKey,
        storageProvider: cvStorageProvider,
        contentType: cvContentType,
        size: cvSize,
        generatedFromProfile,
      },
      answers,
      coverLetter: cleanMultiline(body.coverLetter, 4000),
      statusHistory: [{status: "submitted", at: now, actor: "candidate"}],
      submittedAt: now,
      updatedAt: now,
      viewedAt: null,
      talentPoolConsent: body.talentPoolConsent === true,
      talentPoolConsentAt: body.talentPoolConsent === true ? now : null,
      talentPoolConsentExpiresAt: body.talentPoolConsent === true
        ? admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000)
        : null,
      talentPool: false,
      privacyVersion: "2026-08-21",
      termsVersion: "2026-07-24",
      source: "career_unified_direct_apply",
    };

    await db.runTransaction(async (transaction: any) => {
      const freshApplication = await transaction.get(applicationRef);
      const freshJob = await transaction.get(jobSnap.ref);
      if (freshApplication.exists) {
        throw new DuplicateApplicationError(applicationId, freshApplication.data()?.status);
      }
      if (!freshJob.exists || !isActiveJob(freshJob.data() || {})) {
        throw new ApplicationError(410, "Applications for this job are closed.");
      }
      transaction.create(applicationRef, application);
      transaction.create(db.doc(`applicationNotes/${applicationId}`), {
        applicationId,
        recruiterId,
        note: "",
        createdAt: now,
        updatedAt: now,
      });
      transaction.update(jobSnap.ref, {
        applicationsCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    applicationCreated = true;

    if (body.saveToProfile !== false) {
      failureStage = "profile_update";
      await userSnap.ref.set(
        {
          name: fullName,
          email,
          phone,
          location,
          city,
          province,
          ...(nationalityCode ? {nationality, nationalityCode} : {}),
          ...(qualification ? {degreeType: qualification} : {}),
          ...(gender ? {gender} : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      ).catch((error: unknown) => {
        // The application has already been committed. A profile convenience
        // update must never make a successful application appear to have failed.
        console.warn("DIRECT_APPLY_PROFILE_UPDATE_FAILED", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      });
    }

    failureStage = "notification";
    await enqueuePartnerWebhook({
      recruiterId,
      event: "application.received",
      data: {
        applicationId,
        jobId,
        status: "submitted",
        screeningResult,
        submittedAt: now.toDate().toISOString(),
      },
    }).catch((error) => {
      console.error("APPLICATION_WEBHOOK_ENQUEUE_ERROR", error);
    });

    const confirmationMessage = applicationConfirmationEmail({
      fullName,
      jobTitle: application.jobSnapshot.title || "this position",
      companyName: application.jobSnapshot.company || "the employer",
      applicationId,
      submittedAt: now.toDate(),
    });
    let candidateConfirmationEmail: Record<string, unknown>;
    try {
      const delivery = await sendTransactionalEmail({
        to: email,
        ...confirmationMessage,
        tag: "direct-apply-confirmation",
      });
      candidateConfirmationEmail = {
        status: "sent",
        providerMessageId: delivery.id || null,
        sentAt: admin.firestore.Timestamp.now(),
      };
    } catch (error) {
      candidateConfirmationEmail = {
        status: "failed",
        failedAt: admin.firestore.Timestamp.now(),
      };
      console.error("DIRECT_APPLY_CONFIRMATION_EMAIL_ERROR", {
        applicationId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }

    await applicationRef.set(
      {candidateConfirmationEmail, updatedAt: admin.firestore.Timestamp.now()},
      {merge: true},
    ).catch((error: unknown) => {
      console.warn("DIRECT_APPLY_CONFIRMATION_STATUS_WRITE_FAILED", {
        applicationId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    });

    return json(201, origin, {
      applicationId,
      status: "submitted",
      screeningResult,
      message: "Application submitted successfully.",
    });
  } catch (error: any) {
    if (copiedCvPath && !applicationCreated) {
      try {
        const admin = getAdmin();
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
        await admin.storage().bucket(bucketName).file(copiedCvPath).delete({ignoreNotFound: true});
      } catch {
        // Cleanup is best-effort; never expose storage details to the client.
      }
    }
    if (copiedCvBlobKey && !applicationCreated) {
      await deletePrivateCv(copiedCvBlobKey).catch(() => undefined);
    }

    if (error instanceof DuplicateApplicationError) {
      return json(409, origin, {
        error: error.message,
        duplicate: true,
        existingApplication: {
          id: error.applicationId,
          status: error.status,
        },
      });
    }
    if (error instanceof ApplicationError) {
      return json(error.statusCode, origin, {error: error.message});
    }
    const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
    console.error("SUBMIT_JOB_APPLICATION_ERROR", {
      reference,
      stage: failureStage,
      errorName: error instanceof Error ? error.name : "UnknownError",
      error,
    });
    return json(500, origin, {
      error: "Could not submit your application. Please try again.",
      reference,
    });
  }
};
