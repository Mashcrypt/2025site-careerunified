// netlify/functions/daily-bursary-draft.js
import { getDb } from "./_firebaseAdmin";
import { fetchLatestBursariesFromSite } from "./_scrapeJobs";
import { generateWhatsAppPost } from "./_openai";
import { sendApprovalEmail } from "./_notify";

const COLLECTION = "post_drafts";
const BURSARY_LIMIT = 3;

export async function handler() {
  try {
    const db = getDb();
    const bursaries = await fetchLatestBursariesFromSite(BURSARY_LIMIT);

    if (!bursaries.length) {
      return {
        statusCode: 200,
        body: "No bursaries found.",
      };
    }

    let createdCount = 0;
    const createdIds = [];

    for (const bursary of bursaries) {
      if (!bursary?.url) continue;

      const existing = await db
        .collection(COLLECTION)
        .where("itemUrl", "==", bursary.url)
        .limit(1)
        .get();

      if (!existing.empty) {
        continue;
      }

      const postText = await generateWhatsAppPost(bursary);

      const docRef = await db.collection(COLLECTION).add({
        itemUrl: bursary.url,
        itemType: "bursary",
        item: bursary,
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
          subject: `Career Unified: New bursary draft ready`,
          text:
            `A new bursary draft is ready for approval.\n\n` +
            `Approve here:\n${approveUrl}\n\n` +
            `Title: ${bursary.title}\n` +
            `Company: ${bursary.company}\n` +
            `Link: ${bursary.url}`,
        });
      }
    }

    return {
      statusCode: 200,
      body:
        createdCount > 0
          ? `Created ${createdCount} new bursary draft(s): ${createdIds.join(", ")}`
          : "No new bursaries to draft.",
    };
  } catch (e) {
    console.error("daily-bursary-draft error:", e);
    return {
      statusCode: 500,
      body: `Error: ${e?.message || String(e)}`,
    };
  }
}
