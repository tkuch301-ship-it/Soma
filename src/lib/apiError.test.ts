import { describe, it, expect, vi, afterEach } from "vitest";
import { handleApiError } from "./apiError";
import { ValidationError, NotFoundError, ConflictError } from "./errors";

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
