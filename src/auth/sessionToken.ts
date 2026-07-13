import crypto from "crypto";

const TOKEN_BYTE_LENGTH = 32;

export function generateSessionToken(): string {
  return generateRandomToken();
}

export function generateCsrfToken(): string {
  return generateRandomToken();
}

export function hashToken(token: string): Buffer {
  return crypto.createHash("sha256").update(token, "utf8").digest();
}

export function timingSafeEqualTokenHash(
  expectedHash: Buffer,
  providedToken: string,
): boolean {
  const providedHash = hashToken(providedToken);

  return crypto.timingSafeEqual(expectedHash, providedHash);
}

function generateRandomToken(): string {
  return crypto.randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");
}
