import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";
import {ApplicationError, bearerToken, cleanText, corsHeaders, json} from "./_applicationUtils";
import {checkRateLimit} from "./_rateLimit";
import {recruiterTalentAccess} from "./_recruiterTalentAccess";

const MAX_CVS = 250;

function dateMillis(value: any) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function safeHttpsUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    const allowedHosts = new Set([
      "careerunified.com",
      "www.careerunified.com",
      "firebasestorage.googleapis.com",
      "storage.googleapis.com",
      "lh3.googleusercontent.com",
    ]);
    return url.protocol === "https:" && allowedHosts.has(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function getProfiles(admin: any, userIds: string[]) {
  const profiles = new Map<string, Record<string, any>>();
  const db = admin.firestore();

  for (let offset = 0; offset < userIds.length; offset += 100) {
    const ids = userIds.slice(offset, offset + 100);
    if (!ids.length) continue;
    const snapshots = await db.getAll(...ids.map(id => db.doc(`users/${id}`)));
    snapshots.forEach((snapshot: any) => {
      if (snapshot.exists) profiles.set(snapshot.id, snapshot.data() || {});
    });
  }

  return profiles;
}

export const handler: Handler = async event => {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 200, headers: corsHeaders(origin), body: ""};
  }
  if (event.httpMethod !== "GET") return json(405, origin, {error: "Method Not Allowed"});

  try {
    const admin = getAdmin();
    const token = bearerToken(event);
    if (!token) throw new ApplicationError(401, "Please log in.");

    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new ApplicationError(401, "Your login session has expired. Please log in again.");
    }
    if (decoded.recruiter !== true && decoded.admin !== true) {
      throw new ApplicationError(403, "Recruiter access is required.");
    }

    const rateLimit = await checkRateLimit({
      admin,
      action: "talent-library-list",
      identifier: `uid:${decoded.uid}`,
      limit: 60,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return json(
        429,
        origin,
        {error: "Too many talent-library requests. Please try again later."},
        {"Retry-After": String(rateLimit.retryAfterSeconds)},
      );
    }

    const db = admin.firestore();
    const recruiterSnapshot = await db.doc(`recruiters/${decoded.uid}`).get();
    if (!recruiterSnapshot.exists && decoded.admin !== true) {
      throw new ApplicationError(403, "Recruiter profile not found.");
    }
    const access = decoded.admin === true
      ? {active: true, plan: "enterprise", unlimited: true, unlockedCVs: [], unlocksRemaining: -1}
      : recruiterTalentAccess(recruiterSnapshot.data() || {});
    const unlocked = new Set(access.unlockedCVs);

    const cvSnapshot = await db.collection("cvs").limit(MAX_CVS).get();
    const sorted = cvSnapshot.docs
      .map((snapshot: any) => ({id: snapshot.id, data: snapshot.data() || {}}))
      .filter((cv: any) => cv.data.status !== "inactive")
      .sort((left: any, right: any) => dateMillis(right.data.uploadedAt) - dateMillis(left.data.uploadedAt));

    const latestByUser = new Map<string, {id: string; data: Record<string, any>}>();
    sorted.forEach((cv: any) => {
      const userId = cleanText(cv.data.userId || cv.id, 180);
      if (userId && !latestByUser.has(userId)) latestByUser.set(userId, cv);
    });
    const cvs = Array.from(latestByUser.values());
    const profiles = await getProfiles(
      admin,
      cvs.map(cv => cleanText(cv.data.userId, 180)).filter(Boolean),
    );

    const candidates = cvs.map((cv, index) => {
      const userId = cleanText(cv.data.userId, 180);
      const profile = profiles.get(userId) || {};
      const isUnlocked = decoded.admin === true || (access.active && unlocked.has(cv.id));
      const isFreePreview = !access.active && index < 10;
      const identityVisible = isUnlocked || isFreePreview;

      return {
        id: cv.id,
        fullName: identityVisible
          ? cleanText(profile.name || profile.fullName || cv.data.fullName || "Candidate", 120)
          : "Candidate profile",
        jobTitle: cleanText(profile.desiredJobTitle || cv.data.jobTitle || "Job Seeker", 140),
        location: cleanText(profile.location || cv.data.location || "Location not specified", 140),
        phone: isUnlocked ? cleanText(profile.phone || "Not specified", 60) : "Not specified",
        email: isUnlocked ? cleanText(profile.email || cv.data.userEmail || "Not specified", 180) : "Not specified",
        institution: cleanText(profile.institutionName || profile.institution || "Not specified", 160),
        degreeType: cleanText(profile.degreeType || "Not specified", 100),
        fieldOfStudy: cleanText(profile.fieldOfStudy || "Not specified", 140),
        expectedGraduation: cleanText(profile.graduationYear || profile.expectedGraduation || "Not specified", 40),
        desiredJobTitle: cleanText(profile.desiredJobTitle || "Not specified", 140),
        preferredLocation: cleanText(profile.desiredLocation || profile.preferredLocation || "Not specified", 140),
        employmentStatus: cleanText(profile.employmentStatus || "Not specified", 100),
        profilePhotoURL: identityVisible ? safeHttpsUrl(profile.profilePhotoURL || cv.data.profilePhotoURL) : "",
        skills: cleanText(cv.data.skills || profile.skills || "Not specified", 600),
        experience: cleanText(cv.data.experience || "1-3 years", 80),
        availability: cleanText(cv.data.availability || "immediate", 80),
        yearsExp: Number.parseInt(String(cv.data.experience || "1"), 10) || 1,
        uploadedAt: new Date(dateMillis(cv.data.uploadedAt) || Date.now()).toISOString(),
        unlocked: isUnlocked,
      };
    });

    return json(200, origin, {
      candidates,
      total: candidates.length,
      plan: access.plan,
      accessActive: access.active,
    }, {"Cache-Control": "private, no-store"});
  } catch (error: any) {
    if (error instanceof ApplicationError) return json(error.statusCode, origin, {error: error.message});
    console.error("LIST_TALENT_CVS_ERROR", error instanceof Error ? error.message : "Unknown error");
    return json(500, origin, {error: "Could not load the talent library. Please try again."});
  }
};
