import type { Handler } from "@netlify/functions";
import Busboy from "busboy";
import pdf from "pdf-parse";
import mammoth from "mammoth";

type ParsedFile = { filename: string; mimeType: string; buffer: Buffer };

function parseMultipart(event: any): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const contentType =
      event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return reject(new Error("Expected multipart/form-data"));
    }

    const bb = Busboy({ headers: { "content-type": contentType } });

    let file: ParsedFile | null = null;

    bb.on("file", (_field, stream, info) => {
      const { filename, mimeType } = info;
      const chunks: Buffer[] = [];

      stream.on("data", (d: Buffer) => chunks.push(d));
      stream.on("end", () => {
        file = { filename, mimeType, buffer: Buffer.concat(chunks) };
      });
    });

    bb.on("error", reject);

    bb.on("finish", () => {
      if (!file) return reject(new Error("No file uploaded"));
      resolve(file);
    });

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");

    bb.end(body);
  });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const uploaded = await parseMultipart(event);

    const name = uploaded.filename.toLowerCase();
    const isPdf = uploaded.mimeType === "application/pdf" || name.endsWith(".pdf");
    const isDocx =
      uploaded.mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx");

    if (!isPdf && !isDocx) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Only PDF or DOCX is supported for text extraction right now.",
        }),
      };
    }

    let text = "";

    if (isPdf) {
      const result = await pdf(uploaded.buffer);
      text = result.text || "";
    } else {
      const result = await mammoth.extractRawText({ buffer: uploaded.buffer });
      text = result.value || "";
    }

    // small cleanup
    text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
      },
      body: JSON.stringify({ text }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err?.message || "Extraction failed" }),
    };
  }
};
