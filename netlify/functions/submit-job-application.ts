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
import {copyPrivateCv, deletePrivateCv} from "./_privateCvStore";
import {enqueuePartnerWebhook} from "./_partnerWebhooks";

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

  try {
    const admin = getAdmin();
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please log in before applying.");

    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please log in again.");
    }

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

    const body = parseJsonBody(event);
    const jobId = cleanText(body.jobId, 160);
    const cvId = cleanText(body.cvId, 180);
    if (!jobId) throw new ApplicationError(400, "A valid job is required.");
    if (!cvId) throw new ApplicationError(400, "Please select or upload a CV.");
    if (body.privacyAccepted !== true || body.declarationAccepted !== true || body.termsAccepted !== true) {
      throw new ApplicationError(400, "Please accept the declaration, Privacy Policy, and Terms and Conditions.");
    }

    const db = admin.firestore();
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
    const location = cleanText(contact.location || profile.location, 160);
    const qualification = cleanText(contact.qualification || profile.degreeType, 160);
    const currentJobTitle = cleanText(profile.currentJobTitle, 160);
    const yearsOfExperience = cleanText(profile.yearsOfExperience, 80);
    const profilePhotoURL = cleanText(profile.profilePhotoURL, 1200);

    if (!fullName || !email || !phone || !location) {
      throw new ApplicationError(400, "Name, verified email, telephone, and location are required.");
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
        label: question.label,
        type: question.type,
        answer,
        visibleToCandidate: shouldIncludeQuestion,
        essentialMatch: answerMatches(question, answer),
      };
    }).filter((answer) => answer.visibleToCandidate);

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

    const sourceCvPath = storagePathFromCv(cv);
    const sourceCvBlobKey = cleanText(cv.blobKey, 800);
    if (!sourceCvPath && !sourceCvBlobKey) {
      throw new ApplicationError(400, "Please upload this CV again before applying.");
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
    const bucket = admin.storage().bucket(bucketName);
    const cvFileName = safeFilename(cv.cvFileName);
    const cvSnapshotId = crypto.randomUUID();
    const cvContentType = cleanText(cv.contentType, 120) || "application/octet-stream";
    if (sourceCvBlobKey) {
      copiedCvBlobKey = `applications/${recruiterId}/${jobId}/${decoded.uid}/${applicationId}_${cvSnapshotId}`;
      const copied = await copyPrivateCv(sourceCvBlobKey, copiedCvBlobKey, {
        candidateId: decoded.uid,
        recruiterId,
        jobId,
        applicationId,
        contentType: cvContentType,
        fileName: cvFileName,
      });
      if (!copied) throw new ApplicationError(400, "Please upload this CV again before applying.");
    } else {
      copiedCvPath = `applications/${recruiterId}/${jobId}/${decoded.uid}/${applicationId}_${cvSnapshotId}_${cvFileName}`;
      await bucket.file(sourceCvPath).copy(bucket.file(copiedCvPath));
      await bucket.file(copiedCvPath).setMetadata({
        contentType: cvContentType,
        cacheControl: "private, max-age=0, no-store",
        metadata: {
          candidateId: decoded.uid,
          recruiterId,
          jobId,
          applicationId,
        },
      });
    }

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
        qualification,
        currentJobTitle,
        yearsOfExperience,
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
        storagePath: copiedCvPath,
        blobKey: copiedCvBlobKey,
        storageProvider: copiedCvBlobKey ? "netlify_blobs" : "firebase",
        contentType: cvContentType,
        size: Number(cv.size || 0),
      },
      answers,
      coverLetter: cleanMultiline(body.coverLetter, 4000),
      statusHistory: [{status: "submitted", at: now, actor: "candidate"}],
      submittedAt: now,
      updatedAt: now,
      viewedAt: null,
      privacyVersion: "2026-07-24",
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
      await userSnap.ref.set(
        {
          name: fullName,
          email,
          phone,
          location,
          ...(qualification ? {degreeType: qualification} : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }

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
    console.error("SUBMIT_JOB_APPLICATION_ERROR", error);
    return json(500, origin, {error: "Could not submit your application. Please try again."});
  }
};
