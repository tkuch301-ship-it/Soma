import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ForbiddenError } from "./errors";

/** Name of the HttpOnly cookie that carries the admin session token. */
export const ADMIN_COOKIE_NAME = "soma_admin";

/** Admin sessions are valid for 30 days from the moment they're issued. */
export const ADMIN_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const ADMIN_SESSION_MAX_AGE_SECONDS = ADMIN_SESSION_MAX_AGE_MS / 1000;

/**
 * Everything below that only deals in strings/numbers (no NextRequest) is
 * kept pure and exported so it can be unit tested without constructing a
 * real Next.js request object.
 */

/** Reads ADMIN_PASSWORD lazily (not at module load) so tests can toggle it via process.env. */
export function getAdminPassword(): string | undefined {
  const value = process.env.ADMIN_PASSWORD;
  return value && value.length > 0 ? value : undefined;
}

export function isAdminPasswordConfigured(): boolean {
  return getAdminPassword() !== undefined;
}

/**
 * Derives a fixed-length signing key from ADMIN_PASSWORD. Using a derived
 * key (rather than the raw password) as the HMAC key means the token format
 * doesn't leak anything about the password's length or bytes.
 */
function deriveSigningKey(password: string): Buffer {
  return createHash("sha256").update(`soma:admin-cookie:${password}`).digest();
}

function sign(expiresAtMs: number, password: string): string {
  const key = deriveSigningKey(password);
  return createHmac("sha256", key).update(String(expiresAtMs)).digest("hex");
}

/**
 * Builds a self-contained session token: `<expiresAtMs>.<hmac>`. The HMAC
 * covers the expiry timestamp and is keyed off ADMIN_PASSWORD, so the token
 * can be verified statelessly (no server-side session store) and can't be
 * forged or have its expiry extended without knowing the password.
 */
export function createAdminToken(password: string, now: number = Date.now()): string {
  const expiresAtMs = now + ADMIN_SESSION_MAX_AGE_MS;
  return `${expiresAtMs}.${sign(expiresAtMs, password)}`;
}

/**
 * Verifies a token string produced by createAdminToken. Returns false (never
 * throws) for missing/malformed/expired/tampered tokens.
 */
export function verifyAdminToken(
  token: string | undefined | null,
  password: string,
  now: number = Date.now()
): boolean {
  if (!token) return false;
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return false;

  const expiresRaw = token.slice(0, separatorIndex);
  const signatureHex = token.slice(separatorIndex + 1);

  const expiresAtMs = Number(expiresRaw);
  if (!Number.isFinite(expiresAtMs)) return false;
  if (expiresAtMs <= now) return false; // expired

  const expectedSignatureHex = sign(expiresAtMs, password);

  // Signatures are fixed-length hex-encoded SHA-256 HMACs, but guard the
  // length anyway before handing both buffers to timingSafeEqual (which
  // throws on mismatched lengths rather than returning false).
  const actual = Buffer.from(signatureHex, "hex");
  const expected = Buffer.from(expectedSignatureHex, "hex");
  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

/**
 * Constant-time password comparison (via SHA-256 digests of equal length),
 * so a wrong-length or wrong-content password can't be distinguished by
 * timing.
 */
export function verifyPassword(input: unknown, password: string): boolean {
  if (typeof input !== "string") return false;
  const inputDigest = createHash("sha256").update(input).digest();
  const passwordDigest = createHash("sha256").update(password).digest();
  return timingSafeEqual(inputDigest, passwordDigest);
}

// ---------- NextRequest-facing helpers ----------

/**
 * True if `req` carries a currently-valid admin session cookie. Returns
 * false (never throws) when ADMIN_PASSWORD isn't configured, so guarded
 * endpoints uniformly 403 instead of 500 in that case.
 */
export function isAdminRequest(req: NextRequest): boolean {
  const password = getAdminPassword();
  if (!password) return false;
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminToken(token, password);
}

/** Throws ForbiddenError (→ 403) unless `req` carries a valid admin session. */
export function requireAdmin(req: NextRequest): void {
  if (!isAdminRequest(req)) {
    throw new ForbiddenError("管理者のみ操作できます");
  }
}
