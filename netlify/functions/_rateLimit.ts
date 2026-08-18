import crypto from "crypto";
import net from "net";

type RateLimitOptions = {
  admin: any;
  action: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function checkRateLimit({
  admin,
  action,
  identifier,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowMs = windowSeconds * 1000;
  const bucket = Math.floor(nowMs / windowMs);
  const windowEndMs = (bucket + 1) * windowMs;
  const id = hash(`${action}:${identifier}:${bucket}`);
  const identifierHash = hash(identifier);
  const ref = admin.firestore().collection("rateLimits").doc(id);

  let result: RateLimitResult = {
    allowed: true,
    remaining: Math.max(0, limit - 1),
    retryAfterSeconds: 0,
  };

  await admin.firestore().runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const currentCount = Number(snap.data()?.count || 0);

    if (currentCount >= limit) {
      result = {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000)),
      };
      return;
    }

    const nextCount = currentCount + 1;
    tx.set(
      ref,
      {
        action,
        identifierHash,
        bucket,
        count: nextCount,
        limit,
        windowSeconds,
        windowEndsAt: admin.firestore.Timestamp.fromMillis(windowEndMs),
        createdAt: snap.exists
          ? snap.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()
          : admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    result = {
      allowed: true,
      remaining: Math.max(0, limit - nextCount),
      retryAfterSeconds: 0,
    };
  });

  return result;
}

export function clientIpFromHeaders(headers: Record<string, string | undefined>) {
  const netlifyIp = headers["x-nf-client-connection-ip"] || headers["X-Nf-Client-Connection-Ip"];
  const forwarded = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  const clientIp = headers["client-ip"] || headers["Client-Ip"];
  const candidates = [netlifyIp, forwarded?.split(",")[0], clientIp];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim().replace(/^\[|\]$/g, "");
    if (net.isIP(value)) return value;
  }

  return "unknown";
}
