import type {Config, Handler} from "@netlify/functions";
import {deletePrivateCv} from "./_privateCvStore";
import {getAdmin} from "./_firebaseAdmin";

export const config: Config = {schedule: "15 3 * * *"};

export const handler: Handler = async () => {
  try {
    const admin = getAdmin();
    const db = admin.firestore();
    let deleted = 0;
    let failed = 0;

    for (let batch = 0; batch < 20; batch += 1) {
      const expired = await db.collection("applicationDocumentUploads")
        .where("expiresAt", "<=", admin.firestore.Timestamp.now())
        .limit(250)
        .get();
      if (expired.empty) break;
      const deletedBeforeBatch = deleted;

      for (const snapshot of expired.docs) {
        const key = String(snapshot.data()?.blobKey || "");
        try {
          if (key.startsWith("application-staging/")) await deletePrivateCv(key);
          await snapshot.ref.delete();
          deleted += 1;
        } catch (error) {
          failed += 1;
          console.warn("APPLICATION_DOCUMENT_UPLOAD_CLEANUP_ITEM_FAILED", {
            uploadId: snapshot.id,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }
      if (deleted === deletedBeforeBatch) break;
    }

    console.info("APPLICATION_DOCUMENT_UPLOAD_CLEANUP_COMPLETE", {deleted, failed});
    return {statusCode: failed ? 207 : 200, body: JSON.stringify({deleted, failed})};
  } catch (error) {
    console.error("APPLICATION_DOCUMENT_UPLOAD_CLEANUP_FAILED", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {statusCode: 500, body: "Application document upload cleanup failed."};
  }
};
