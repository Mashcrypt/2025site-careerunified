type NotificationChannel = "email" | "inApp";

type NotificationPreferenceCheck = {
  admin: any;
  userId: string;
  channel: NotificationChannel;
  opportunityType?: string;
  industry?: string;
  updateType?: string;
  allowWhenMissing?: boolean;
};

type NotificationPreferenceDecision = {
  allowed: boolean;
  reason: "allowed" | "missing-preferences" | "alerts-disabled" | "channel-disabled" | "type-disabled";
};

function selectedValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function userAllowsNotification({
  admin,
  userId,
  channel,
  opportunityType = "",
  industry = "",
  updateType = "",
  allowWhenMissing = false,
}: NotificationPreferenceCheck): Promise<NotificationPreferenceDecision> {
  const uid = String(userId || "").trim();
  if (!uid) return {allowed: false, reason: "missing-preferences"};

  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const preferences = userData.notificationPreferences;
  const hasPreferences = preferences && typeof preferences === "object" && !Array.isArray(preferences);

  if (!hasPreferences) {
    return {
      allowed: allowWhenMissing,
      reason: allowWhenMissing ? "allowed" : "missing-preferences",
    };
  }
  if (preferences.enabled !== true) {
    return {allowed: false, reason: "alerts-disabled"};
  }
  if (!selectedValues(preferences.channels).includes(channel)) {
    return {allowed: false, reason: "channel-disabled"};
  }
  if (updateType && !selectedValues(preferences.updates).includes(updateType)) {
    return {allowed: false, reason: "type-disabled"};
  }
  if (opportunityType && !selectedValues(preferences.opportunityTypes).includes(opportunityType)) {
    return {allowed: false, reason: "type-disabled"};
  }

  const industries = selectedValues(preferences.industries);
  if (industry && industries.length && !industries.includes(industry) && !industries.includes("General / Any Industry")) {
    return {allowed: false, reason: "type-disabled"};
  }

  return {allowed: true, reason: "allowed"};
}
