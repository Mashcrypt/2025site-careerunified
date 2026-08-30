import {PDFDocument, PDFFont, PDFPage, StandardFonts, rgb} from "pdf-lib";

type ProfileCvDetails = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  qualification?: string;
  currentJobTitle?: string;
  currentCompany?: string;
  yearsOfExperience?: string;
  institutionName?: string;
  fieldOfStudy?: string;
  graduationYear?: string;
  industry?: string;
  summary?: string;
  skills?: unknown;
  homeLanguages?: unknown;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT_MARGIN = 54;
const RIGHT_MARGIN = 54;
const TOP_MARGIN = 54;
const BOTTOM_MARGIN = 54;
const TEXT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
const INK = rgb(0.08, 0.12, 0.2);
const MUTED_INK = rgb(0.3, 0.36, 0.45);
const ACCENT = rgb(0.09, 0.37, 0.72);
const RULE = rgb(0.82, 0.86, 0.91);

function printableText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asList(value: unknown) {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;|]/)
      : [];
  return items.map(printableText).filter(Boolean).slice(0, 24);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth = TEXT_WIDTH) {
  const words = printableText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildProfileCvPdf(details: ProfileCvDetails) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage;
  let y: number;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - TOP_MARGIN;
  };

  const ensureSpace = (height: number) => {
    if (y - height < BOTTOM_MARGIN) newPage();
  };

  const drawWrapped = (
    value: unknown,
    options: {size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gapAfter?: number} = {},
  ) => {
    const text = printableText(value);
    if (!text) return;
    const size = options.size || 10;
    const font = options.font || regular;
    const lineHeight = size * 1.42;
    const lines = wrapText(text, font, size);
    lines.forEach((line) => {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: LEFT_MARGIN,
        y,
        size,
        font,
        color: options.color || INK,
      });
      y -= lineHeight;
    });
    y -= options.gapAfter ?? 3;
  };

  const drawSection = (heading: string, values: unknown[]) => {
    const content = values.map(printableText).filter(Boolean);
    if (!content.length) return;
    ensureSpace(44);
    y -= 10;
    page.drawText(heading.toUpperCase(), {
      x: LEFT_MARGIN,
      y,
      size: 10,
      font: bold,
      color: ACCENT,
    });
    y -= 9;
    page.drawLine({
      start: {x: LEFT_MARGIN, y},
      end: {x: PAGE_WIDTH - RIGHT_MARGIN, y},
      thickness: 0.7,
      color: RULE,
    });
    y -= 14;
    content.forEach((value) => drawWrapped(value, {size: 10, gapAfter: 4}));
  };

  newPage();
  drawWrapped(details.fullName || "Candidate", {size: 23, font: bold, color: INK, gapAfter: 4});
  drawWrapped(
    [details.email, details.phone, details.location].map(printableText).filter(Boolean).join("  |  "),
    {size: 9, color: MUTED_INK, gapAfter: 7},
  );
  page.drawLine({
    start: {x: LEFT_MARGIN, y},
    end: {x: PAGE_WIDTH - RIGHT_MARGIN, y},
    thickness: 1.2,
    color: ACCENT,
  });
  y -= 4;

  drawSection("Professional profile", [
    details.summary,
    [details.currentJobTitle, details.currentCompany].map(printableText).filter(Boolean).join(" at "),
    details.yearsOfExperience ? `${printableText(details.yearsOfExperience)} years of experience` : "",
    details.industry ? `Industry: ${printableText(details.industry)}` : "",
  ]);

  drawSection("Education", [
    [details.qualification, details.fieldOfStudy].map(printableText).filter(Boolean).join(" - "),
    [details.institutionName, details.graduationYear].map(printableText).filter(Boolean).join(" | "),
  ]);

  const skills = asList(details.skills);
  drawSection("Skills", skills.length ? [skills.join(" | ")] : []);

  const languages = asList(details.homeLanguages);
  drawSection("Languages", languages.length ? [languages.join(" | ")] : []);

  pdfDoc.setTitle(`${printableText(details.fullName) || "Candidate"} CV`);
  pdfDoc.setAuthor("Career Unified");
  pdfDoc.setCreator("Career Unified Direct Apply");
  pdfDoc.setProducer("Career Unified");

  return Buffer.from(await pdfDoc.save({useObjectStreams: false}));
}
