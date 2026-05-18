import { getAdmin } from "./_firebaseAdmin";

const COLLECTION = "interviewQuestions";

function toIso(value: any) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return "";
}

function questionList(text = "") {
  return String(text)
    .split(/\r?\n|(?<=\?)\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export async function handler() {
  try {
    const admin = getAdmin();
    const snap = await admin
      .firestore()
      .collection(COLLECTION)
      .where("status", "==", "approved")
      .limit(100)
      .get();

    const questions = snap.docs.map((doc: any) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        company: data.company || "Company",
        role: data.role || "Role not specified",
        year: data.interviewYear || "Recent",
        category: data.category || "General",
        contributor: data.contributorName || "Anonymous",
        uploadedAt: toIso(data.approvedAt || data.submittedAt),
        questions: questionList(data.questions),
        preparationTip: data.preparationTip || "",
        sortAt: toIso(data.approvedAt || data.submittedAt),
      };
    }).sort((a: any, b: any) => String(b.sortAt).localeCompare(String(a.sortAt))).slice(0, 50);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      body: JSON.stringify({ questions }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error?.message || "Could not load questions" }),
    };
  }
}
