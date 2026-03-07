// netlify/functions/daily-job-draft.js
import { getDb } from "./_firebaseAdmin";
import { fetchLatestJobFromSite } from "./_scrapeJobs";
import { generateWhatsAppPost } from "./_openai";
import { sendApprovalEmail } from "./_notify";

export async function handler() {
  try {
    const db = getDb();

    const job = await fetchLatestJobFromSite();

    if (!job || !job.url) {
      throw new Error("Job data is missing or invalid.");
    }

    const existing = await db
      .collection("job_posts")
      .where("jobUrl", "==", job.url)
      .limit(1)
      .get();

    if (!existing.empty) {
      return {
        statusCode: 200,
        body: "No new job (already processed)",
      };
    }

    const postText = await generateWhatsAppPost(job);

    if (!postText || typeof postText !== "string") {
      throw new Error("OpenAI returned empty post text.");
    }

    const docRef = await db.collection("job_posts").add({
      jobUrl: job.url,
      job,
      postText,
      status: "PENDING",
      createdAt: new Date(),
    });

    const base = process.env.APPROVAL_BASE_URL;
    const emailTo = process.env.NOTIFY_EMAIL_TO;

    if (base && emailTo) {
      const cleanBase = base.replace(/\/+$/, "");
      const approveUrl = `${cleanBase}/.netlify/functions/approve-draft?id=${docRef.id}`;

      await sendApprovalEmail({
        to: emailTo,
        subject: "Career Unified: Draft ready for approval",
        text:
          `Your daily WhatsApp post draft is ready.\n\nApprove here:\n${approveUrl}\n\n` +
          `Job:\n${job.title}\n${job.url}`,
      });
    }

    return {
      statusCode: 200,
      body: `Draft created: ${docRef.id}`,
    };
  } catch (e) {
    console.error("daily-job-draft error:", e);
    return {
      statusCode: 500,
      body: `Error: ${e?.message || String(e)}`,
    };
  }
}
