// netlify/functions/daily-job-draft.js
import { getDb } from "./_firebaseAdmin";
import { fetchLatestJobsFromSite } from "./_scrapeJobs";
import { generateWhatsAppPost } from "./_openai";
import { sendApprovalEmail } from "./_notify";

const COLLECTION = "post_drafts";
const JOB_LIMIT = 3;

export async function handler() {
  try {
    const db = getDb();
    const jobs = await fetchLatestJobsFromSite(JOB_LIMIT);

    if (!jobs.length) {
      return {
        statusCode: 200,
        body: "No jobs found.",
      };
    }

    let createdCount = 0;
    const createdIds = [];

    for (const job of jobs) {
      if (!job?.url) continue;

      const existing = await db
        .collection(COLLECTION)
        .where("itemUrl", "==", job.url)
        .limit(1)
        .get();

      if (!existing.empty) {
        continue;
      }

      const postText = await generateWhatsAppPost(job);

      const docRef = await db.collection(COLLECTION).add({
        itemUrl: job.url,
        itemType: "job",
        item: job,
        postText,
        status: "PENDING",
        createdAt: new Date(),
      });

      createdCount += 1;
      createdIds.push(docRef.id);

      const base = process.env.APPROVAL_BASE_URL;
      const emailTo = process.env.NOTIFY_EMAIL_TO;

      if (base && emailTo) {
        const cleanBase = base.replace(/\/+$/, "");
        const approveUrl = `${cleanBase}/.netlify/functions/approve-draft?id=${docRef.id}`;

        await sendApprovalEmail({
          to: emailTo,
          subject: `Career Unified: New job draft ready`,
          text:
            `A new job draft is ready for approval.\n\n` +
            `Approve here:\n${approveUrl}\n\n` +
            `Title: ${job.title}\n` +
            `Company: ${job.company}\n` +
            `Link: ${job.url}`,
        });
      }
    }

    return {
      statusCode: 200,
      body:
        createdCount > 0
          ? `Created ${createdCount} new job draft(s): ${createdIds.join(", ")}`
          : "No new jobs to draft.",
    };
  } catch (e) {
    console.error("daily-job-draft error:", e);
    return {
      statusCode: 500,
      body: `Error: ${e?.message || String(e)}`,
    };
  }
}
