import crypto from "crypto";

function getSecret() {
  return (
    process.env.DRAFT_APPROVAL_SECRET ||
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.FIREBASE_CLIENT_EMAIL ||
    ""
  );
}

function hmac(value) {
  const secret = getSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret.replace(/\\n/g, "\n")).update(value).digest("hex");
}

export function createApprovalToken(id) {
  return hmac(`approve-draft:${id}`);
}

export function verifyApprovalToken(id, token) {
  const expected = createApprovalToken(id);
  if (!expected || !token) return false;

  const expectedBuffer = Buffer.from(expected, "hex");
  const tokenBuffer = Buffer.from(String(token), "hex");
  if (expectedBuffer.length !== tokenBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}
