import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {bearerToken, json} from "./_applicationUtils";

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  try {
    if (event.httpMethod !== "GET") return json(405, origin, {error: "Method Not Allowed"});
    const token = bearerToken(event);
    if (!token) return json(401, origin, {error: "Please sign in again."});
    const admin = getAdmin();
    const decoded: any = await admin.auth().verifyIdToken(token);
    if (decoded.recruiter !== true) return json(403, origin, {error: "Recruiter access is required."});
    const companyId = String(decoded.companyId || decoded.uid);
    const db = admin.firestore();
    const [snapshot, inviteSnapshot] = await Promise.all([
      db.collection("recruiterMembers").where("companyId", "==", companyId).get(),
      db.collection("recruiterInvites").where("companyId", "==", companyId).get(),
    ]);
    const members = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
    inviteSnapshot.docs.forEach(doc => {
      const invite: any = doc.data();
      if (invite.status === "pending" && invite.expiresAt?.toMillis?.() > Date.now()) members.push({id: doc.id, companyId, email: invite.email, role: invite.role, status: "pending", invitedBy: invite.invitedBy, createdAt: invite.createdAt});
    });
    members.sort((a: any, b: any) => String(a.email || "").localeCompare(String(b.email || "")));
    const owner = await admin.auth().getUser(companyId);
    if (!members.some((member: any) => member.userId === companyId)) {
      members.unshift({id: `${companyId}_${companyId}`, companyId, userId: companyId, email: owner.email || "", role: "Administrator", status: "active", owner: true});
    }
    return json(200, origin, {members});
  } catch (error) {
    console.error("RECRUITER_TEAM_ERROR", error instanceof Error ? error.name : "UnknownError");
    return json(500, origin, {error: "The team could not be loaded."});
  }
};
