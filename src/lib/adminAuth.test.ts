import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createAdminToken,
  verifyAdminToken,
  verifyPassword,
  isAdminPasswordConfigured,
  isAdminRequest,
  requireAdmin,
} from "./adminAuth";
import { ForbiddenError } from "./errors";

const ORIGINAL_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

afterEach(() => {
  if (ORIGINAL_ADMIN_PASSWORD === undefined) {
    delete process.env.ADMIN_PASSWORD;
  } else {
    process.env.ADMIN_PASSWORD = ORIGINAL_ADMIN_PASSWORD;
  }
});

function requestWithCookie(cookieValue: string | undefined): NextRequest {
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set("cookie", `${ADMIN_COOKIE_NAME}=${cookieValue}`);
  }
  return new NextRequest("http://localhost/api/tasks/1", { headers });
}

describe("verifyPassword", () => {
  it("accepts the correct password", () => {
    expect(verifyPassword("hunter2", "hunter2")).toBe(true);
  });

  it("rejects an incorrect password", () => {
    expect(verifyPassword("wrong", "hunter2")).toBe(false);
  });

  it("rejects passwords of a different length without throwing", () => {
    expect(verifyPassword("short", "a-much-longer-password")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(verifyPassword(undefined, "hunter2")).toBe(false);
    expect(verifyPassword(123, "hunter2")).toBe(false);
    expect(verifyPassword(null, "hunter2")).toBe(false);
  });
});

describe("createAdminToken / verifyAdminToken", () => {
  it("verifies a freshly created token", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const token = createAdminToken("secret", now);
    expect(verifyAdminToken(token, "secret", now)).toBe(true);
  });

  it("verifies a token right up until (but not including) its expiry", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const token = createAdminToken("secret", now);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(verifyAdminToken(token, "secret", now + thirtyDaysMs - 1)).toBe(true);
  });

  it("rejects an expired token", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const token = createAdminToken("secret", now);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(verifyAdminToken(token, "secret", now + thirtyDaysMs)).toBe(false);
    expect(verifyAdminToken(token, "secret", now + thirtyDaysMs + 1)).toBe(false);
  });

  it("rejects a token signed with a different password", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const token = createAdminToken("secret", now);
    expect(verifyAdminToken(token, "different-secret", now)).toBe(false);
  });

  it("rejects a token whose expiry was tampered with", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const token = createAdminToken("secret", now);
    const [, sig] = token.split(".");
    const tampered = `${now + 1000 * 60 * 60 * 24 * 365}.${sig}`; // pushed expiry a year out
    expect(verifyAdminToken(tampered, "secret", now)).toBe(false);
  });

  it("rejects a token whose signature was tampered with", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const token = createAdminToken("secret", now);
    const [expires] = token.split(".");
    const tampered = `${expires}.${"0".repeat(64)}`;
    expect(verifyAdminToken(tampered, "secret", now)).toBe(false);
  });

  it("rejects malformed tokens", () => {
    expect(verifyAdminToken("not-a-token", "secret")).toBe(false);
    expect(verifyAdminToken("", "secret")).toBe(false);
    expect(verifyAdminToken(undefined, "secret")).toBe(false);
    expect(verifyAdminToken(null, "secret")).toBe(false);
    expect(verifyAdminToken("abc.def", "secret")).toBe(false);
  });
});

describe("isAdminPasswordConfigured", () => {
  it("is false when ADMIN_PASSWORD is unset", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(isAdminPasswordConfigured()).toBe(false);
  });

  it("is false when ADMIN_PASSWORD is an empty string", () => {
    process.env.ADMIN_PASSWORD = "";
    expect(isAdminPasswordConfigured()).toBe(false);
  });

  it("is true once ADMIN_PASSWORD is set", () => {
    process.env.ADMIN_PASSWORD = "test";
    expect(isAdminPasswordConfigured()).toBe(true);
  });
});

describe("isAdminRequest / requireAdmin", () => {
  it("returns false and throws ForbiddenError when ADMIN_PASSWORD is not configured, even with a token cookie", () => {
    delete process.env.ADMIN_PASSWORD;
    const token = createAdminToken("whatever-secret-would-have-been-used");
    const req = requestWithCookie(token);
    expect(isAdminRequest(req)).toBe(false);
    expect(() => requireAdmin(req)).toThrow(ForbiddenError);
  });

  it("returns true and does not throw for a request with a valid session cookie", () => {
    process.env.ADMIN_PASSWORD = "test";
    const token = createAdminToken("test");
    const req = requestWithCookie(token);
    expect(isAdminRequest(req)).toBe(true);
    expect(() => requireAdmin(req)).not.toThrow();
  });

  it("returns false and throws ForbiddenError when there is no cookie", () => {
    process.env.ADMIN_PASSWORD = "test";
    const req = requestWithCookie(undefined);
    expect(isAdminRequest(req)).toBe(false);
    expect(() => requireAdmin(req)).toThrow(ForbiddenError);
  });

  it("returns false and throws ForbiddenError for a tampered cookie", () => {
    process.env.ADMIN_PASSWORD = "test";
    const token = createAdminToken("test");
    const tampered = token.replace(/.$/, token.endsWith("0") ? "1" : "0");
    const req = requestWithCookie(tampered);
    expect(isAdminRequest(req)).toBe(false);
    expect(() => requireAdmin(req)).toThrow(ForbiddenError);
  });

  it("returns false for a cookie signed with a stale/different ADMIN_PASSWORD", () => {
    const token = createAdminToken("old-password");
    process.env.ADMIN_PASSWORD = "new-password";
    const req = requestWithCookie(token);
    expect(isAdminRequest(req)).toBe(false);
  });
});
