import type { Handler } from "@netlify/functions";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = JSON.parse(event.body || "{}") as {
      html?: string;
      fileName?: string;
    };

    if (!payload.html || typeof payload.html !== "string") {
      return json(400, { error: "Missing 'html' in request body." });
    }

    const safeName = (payload.fileName || "CareerUnified-Resume")
      .toString()
      .replace(/[^a-z0-9\-_]/gi, "_")
      .slice(0, 60);

    // ✅ NETLIFY FIX:
    // In some Netlify builds, Sparticuz Chromium looks for /var/task/netlify/bin which may not exist.
    // Force it to use the package's own bundled path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chromium as any).setHeadlessMode?.(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chromium as any).setGraphicsMode?.(false);

    // Ensure chromium knows where its packaged files are.
    // This points to the installed node_modules location at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chromium as any).sourcePath = "/var/task/node_modules/@sparticuz/chromium/bin";

    // Get executable path, with a fallback that works on many Netlify setups
    let executablePath: string | null = null;
    try {
      executablePath = await chromium.executablePath();
    } catch {
      // fallback for environments where chromium.executablePath() tries a non-existent directory
      executablePath =
        "/var/task/node_modules/@sparticuz/chromium/bin/chromium";
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath || undefined,
      headless: chromium.headless,
    });

    try {
      const page = await browser.newPage();

      await page.setContent(payload.html, { waitUntil: "networkidle0" });
      await page.emulateMediaType("screen");
      await page.evaluateHandle("document.fonts.ready");

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });

      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
        body: pdfBuffer.toString("base64"),
      };
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    return json(500, { error: err?.message || "PDF generation failed." });
  }
};
