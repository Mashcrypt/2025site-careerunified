const PAID_PLANS = new Set(["starter", "pro", "enterprise"]);

function timestampMillis(value: any) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;

  const parsed = value instanceof Date ? value : new Date(value);
  const millis = parsed.getTime();
  return Number.isFinite(millis) ? millis : 0;
}
export function recruiterTalentAccess(data: Record<string, any>, now = Date.now()) {
  const storedPlan = String(data.plan || "free").toLowerCase();
  const subscriptionActive =
    data.subscriptionStatus === "active"
    && PAID_PLANS.has(storedPlan)
    && timestampMillis(data.subscriptionCurrentPeriodEnd) > now;
  const trialActive =
    data.subscriptionStatus === "trialing"
    && timestampMillis(data.trialEndsAt) > now;
  const plan = subscriptionActive ? storedPlan : trialActive ? "pro" : "free";
  const unlockedCVs = Array.isArray(data.unlockedCVs)
    ? data.unlockedCVs.filter((value: unknown) => typeof value === "string").slice(0, 1000)
    : [];

  return {
    active: subscriptionActive || trialActive,
    plan,
    unlimited: plan === "enterprise",
    unlockedCVs,
    unlocksRemaining: Number.isFinite(Number(data.unlocksRemaining))
      ? Number(data.unlocksRemaining)
      : 0,
  };
}
