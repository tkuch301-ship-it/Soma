import { describe, it, expect, vi, afterEach } from "vitest";
import { handleApiError, mapPostgrestError } from "./apiError";
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from "./errors";

describe("handleApiError", () => {
  it("maps ValidationError to 400", async () => {
    const res = handleApiError(new ValidationError("bad input"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "bad input" });
  });

  it("maps NotFoundError to 404", async () => {
    const res = handleApiError(new NotFoundError("missing"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "missing" });
  });

  it("maps ConflictError to 409", async () => {
    const res = handleApiError(new ConflictError("duplicate"));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "duplicate" });
  });

  it("maps ForbiddenError to 403 with a fixed Japanese message", async () => {
    const res = handleApiError(new ForbiddenError("anything"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "管理者のみ操作できます" });
  });

  describe("unexpected errors", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    afterEach(() => {
      consoleErrorSpy.mockClear();
    });

    it("maps a generic Error to 500 and logs it", async () => {
      const res = handleApiError(new Error("boom"));
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: "boom" });
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("maps a non-Error throw to 500 with a generic message", async () => {
      const res = handleApiError("just a string");
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: "Internal Server Error" });
    });
  });
});

describe("mapPostgrestError", () => {
  it("maps unique_violation (23505) to ConflictError", () => {
    const err = mapPostgrestError({ code: "23505", message: "duplicate key value" }, "fallback");
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe("duplicate key value");
  });

  it("maps foreign_key_violation (23503) to ValidationError", () => {
    const err = mapPostgrestError({ code: "23503", message: "violates foreign key" }, "fallback");
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("maps not_null_violation (23502) to ValidationError", () => {
    const err = mapPostgrestError({ code: "23502", message: "null value" }, "fallback");
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("maps check_violation (23514) to ValidationError", () => {
    const err = mapPostgrestError({ code: "23514", message: "check constraint" }, "fallback");
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("maps invalid_text_representation (22P02) to ValidationError", () => {
    const err = mapPostgrestError({ code: "22P02", message: "invalid input syntax" }, "fallback");
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("maps PGRST116 (no/too many rows) to NotFoundError", () => {
    const err = mapPostgrestError({ code: "PGRST116", message: "no rows" }, "fallback");
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it("falls back to a generic Error for unknown codes", () => {
    const err = mapPostgrestError({ code: "99999", message: "weird" }, "fallback");
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect(err).not.toBeInstanceOf(ConflictError);
    expect(err.message).toBe("weird");
  });

  it("uses the fallback message when the error has no message", () => {
    const err = mapPostgrestError({ code: "99999" }, "fallback message");
    expect(err.message).toBe("fallback message");
  });

  it("returns a generic Error with the fallback message when error is null/undefined", () => {
    expect(mapPostgrestError(null, "fallback").message).toBe("fallback");
    expect(mapPostgrestError(undefined, "fallback").message).toBe("fallback");
  });
});
