import {cleanText} from "./_applicationUtils";

export const APPLICATION_DOCUMENT_ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png";
export const APPLICATION_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const APPLICATION_DOCUMENT_TYPES = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
} as const;

export type ApplicationDocumentRequest = {
  id: string;
  label: string;
  required: boolean;
  acceptedTypes: string[];
  maxSizeBytes: number;
};

export function normalizeApplicationDocuments(value: unknown): ApplicationDocumentRequest[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ApplicationDocumentRequest[] = [];

  for (const [index, raw] of value.slice(0, 5).entries()) {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    let id = cleanText(item.id, 80);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || seen.has(id)) id = `application_document_${index + 1}`;
    if (seen.has(id)) continue;
    const label = cleanText(item.label, 120);
    if (!label) continue;

    seen.add(id);
    result.push({
      id,
      label,
      required: item.required !== false,
      acceptedTypes: Object.values(APPLICATION_DOCUMENT_TYPES),
      maxSizeBytes: APPLICATION_DOCUMENT_MAX_BYTES,
    });
  }

  return result;
}

export function applicationDocumentFileType(filename: string, buffer: Buffer) {
  const extension = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  const contentType = APPLICATION_DOCUMENT_TYPES[extension as keyof typeof APPLICATION_DOCUMENT_TYPES];
  if (!contentType || buffer.length < 8) return null;

  const signature = buffer.subarray(0, 8).toString("hex").toLowerCase();
  const valid = extension === ".pdf"
    ? buffer.subarray(0, 4).toString("ascii") === "%PDF"
    : extension === ".docx"
      ? signature.startsWith("504b0304")
      : extension === ".jpg" || extension === ".jpeg"
        ? signature.startsWith("ffd8ff")
        : extension === ".png"
          ? signature === "89504e470d0a1a0a"
          : false;

  return valid ? {extension, contentType} : null;
}
