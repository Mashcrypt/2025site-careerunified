export async function fetchLatestJobFromSite() {
  const indexUrl = process.env.CAREERUNIFIED_JOBS_INDEX_URL;
  if (!indexUrl) throw new Error("Missing CAREERUNIFIED_JOBS_INDEX_URL");

  const resp = await fetch(indexUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Netlify Function) CareerUnifiedBot/1.0",
      Accept: "text/html,*/*",
    },
  });

  const html = await resp.text();

  // TEMP DEBUG: show what the function sees
  throw new Error(
    "DEBUG HTML HEAD:\n" +
      html.slice(0, 5000).replace(/\s+/g, " ").trim()
  );
}
