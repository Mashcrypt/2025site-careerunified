const PROJECT_ID = "career-unified";
const DATABASE_ID = "(default)";
const DOCUMENTS_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
  mapValue?: {fields?: Record<string, FirestoreValue>};
  arrayValue?: {values?: FirestoreValue[]};
};

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
};

function decodeValue(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue || "";
  if ("integerValue" in value) return Number(value.integerValue || 0);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return decodeFields(value.mapValue?.fields || {});
  if ("arrayValue" in value) {
    return (value.arrayValue?.values || []).map(decodeValue);
  }
  return null;
}

function decodeFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  );
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[-_]+/g, " ")
    .replace(/\bapply\s+now\b/g, "")
    .replace(/\bclosing\s+soon\b/g, "")
    .replace(/\bor\s+apply\b/g, "")
    .replace(/\bapply\b$/g, "")
    .replace(/\bor\b/g, "")
    .replace(/speciliast/g, "specialist")
    .replace(/machanical/g, "mechanical")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDocument(document: FirestoreDocument) {
  const data = decodeFields(document.fields || {}) as Record<string, unknown>;
  const company = data.company && typeof data.company === "object"
    ? data.company as Record<string, unknown>
    : {};
  const title = text(data.title || data.jobTitle) || "Job Opportunity";
  const companyName = text(
    company.name || data.companyName || data.company,
  ) || "Confidential";
  const city = text(data.city);
  const country = text(data.country);
  const description = text(data.description || data.jobDescription || data.desc);
  const requirements = text(data.requirements);
  const fullDescription = requirements && !description.includes(requirements)
    ? `${description}\n\nRequirements:\n${requirements}`.trim()
    : description;
  const email = text(data.email || data.applyEmail || data.contactEmail);
  const website = text(data.website);
  const documentId = text(document.name?.split("/").pop());

  return {
    _id: documentId,
    slug: text(data.slug) || `${slugify(title)}--${documentId.slice(0, 6)}`,
    title,
    description: fullDescription || "Description not provided.",
    location: text(data.location) || [city, country].filter(Boolean).join(", ") || "South Africa",
    salary: text(data.salary || data.salaryRange) || "Not specified",
    posted: text(data.posted || data.createdAt || data.created_at) || document.createTime || "",
    deadline: text(data.deadline || data.applicationDeadline || data.closingDate),
    jobType: text(data.type || data.jobType || data.employmentType) || "Full-time",
    category: text(data.category),
    applyLink: text(data.applyLink || data.applyURL || data.applyUrl) ||
      website ||
      (email ? `mailto:${email}?subject=${encodeURIComponent(`Application: ${title}`)}` : ""),
    companyName,
    companyLogo: text(company.logoUrl || data.logoUrl || data.logo),
    listingTier: text(data.listingTier || data.tier),
    sponsoredUntil: text(data.sponsoredUntil),
    status: text(data.status || data.state || data.approvalStatus).toLowerCase(),
    draft: Boolean(data.draft),
    _source: "firestore",
  };
}

function isPublished(job: ReturnType<typeof normalizeDocument>) {
  if (job.draft || job.status === "draft") return false;
  return !["rejected", "declined", "removed", "deleted", "blocked"].includes(job.status);
}

export function isActiveRecruiterJob(job: ReturnType<typeof normalizeDocument>) {
  if (!isPublished(job)) return false;
  if (!job.deadline) return true;
  return job.deadline.slice(0, 10) >= new Date().toISOString().slice(0, 10);
}

export async function getRecruiterJobs(limit = 200) {
  const response = await fetch(`${DOCUMENTS_URL}/jobs?pageSize=${limit}`, {
    headers: {Accept: "application/json"},
  });
  if (!response.ok) {
    throw new Error(`Firestore jobs fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.documents || [])
    .map((document: FirestoreDocument) => normalizeDocument(document))
    .filter(isPublished);
}

export async function getRecruiterJobBySlug(slug: string) {
  const response = await fetch(`${DOCUMENTS_URL}:runQuery`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{collectionId: "jobs"}],
        where: {
          fieldFilter: {
            field: {fieldPath: "slug"},
            op: "EQUAL",
            value: {stringValue: slug},
          },
        },
        limit: 1,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Firestore job lookup failed: ${response.status}`);
  }

  const rows = await response.json();
  const document = rows.find((row: {document?: FirestoreDocument}) => row.document)?.document;
  if (!document) return null;

  const job = normalizeDocument(document);
  return isPublished(job) ? job : null;
}
