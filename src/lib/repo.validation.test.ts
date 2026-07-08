import { describe, it, expect } from "vitest";
import { assertValidStatus, assertValidCommentText, parseAssigneeIdsShape } from "./repo";
import { ValidationError } from "./errors";

/**
 * Pure validation unit tests (no Supabase connection needed) for the v3
 * additions: the 4-value task status, the assignee_ids array shape check,
 * and the comment text length bounds.
 */
describe("assertValidStatus", () => {
  it("accepts all four v3 statuses", () => {
    for (const status of ["todo", "doing", "review", "done"]) {
      expect(assertValidStatus(status)).toBe(status);
    }
  });

  it("rejects an unknown status string", () => {
    expect(() => assertValidStatus("blocked")).toThrow(ValidationError);
  });

  it("rejects non-string values", () => {
    expect(() => assertValidStatus(null)).toThrow(ValidationError);
    expect(() => assertValidStatus(undefined)).toThrow(ValidationError);
    expect(() => assertValidStatus(1)).toThrow(ValidationError);
  });
});

describe("parseAssigneeIdsShape", () => {
  it("returns [] when omitted or null", () => {
    expect(parseAssigneeIdsShape(undefined)).toEqual([]);
    expect(parseAssigneeIdsShape(null)).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(parseAssigneeIdsShape([])).toEqual([]);
  });

  it("accepts an array of positive integers", () => {
    expect(parseAssigneeIdsShape([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("de-duplicates ids while preserving first-seen order", () => {
    expect(parseAssigneeIdsShape([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });

  it("rejects a non-array value", () => {
    expect(() => parseAssigneeIdsShape(5)).toThrow(ValidationError);
    expect(() => parseAssigneeIdsShape("1,2,3")).toThrow(ValidationError);
    expect(() => parseAssigneeIdsShape({ id: 1 })).toThrow(ValidationError);
  });

  it("rejects an array containing a non-positive-integer element", () => {
    expect(() => parseAssigneeIdsShape([1, 0])).toThrow(ValidationError);
    expect(() => parseAssigneeIdsShape([1, -2])).toThrow(ValidationError);
    expect(() => parseAssigneeIdsShape([1, 1.5])).toThrow(ValidationError);
    expect(() => parseAssigneeIdsShape([1, "x"])).toThrow(ValidationError);
    expect(() => parseAssigneeIdsShape([1, null])).toThrow(ValidationError);
  });
});

describe("assertValidCommentText", () => {
  it("accepts a normal comment and trims surrounding whitespace", () => {
    expect(assertValidCommentText("  hello world  ")).toBe("hello world");
  });

  it("accepts the 1-character boundary", () => {
    expect(assertValidCommentText("x")).toBe("x");
  });

  it("accepts the 1000-character boundary", () => {
    const text = "a".repeat(1000);
    expect(assertValidCommentText(text)).toBe(text);
  });

  it("rejects an empty string", () => {
    expect(() => assertValidCommentText("")).toThrow(ValidationError);
  });

  it("rejects a whitespace-only string (empty after trim)", () => {
    expect(() => assertValidCommentText("   ")).toThrow(ValidationError);
  });

  it("rejects text over 1000 characters", () => {
    expect(() => assertValidCommentText("a".repeat(1001))).toThrow(ValidationError);
  });

  it("rejects non-string values", () => {
    expect(() => assertValidCommentText(undefined)).toThrow(ValidationError);
    expect(() => assertValidCommentText(null)).toThrow(ValidationError);
    expect(() => assertValidCommentText(42)).toThrow(ValidationError);
  });
});
