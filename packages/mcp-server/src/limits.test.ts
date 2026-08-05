import { describe, expect, it } from "vitest";
import { DEFAULT_LIMIT, MAX_LIMIT, boundList, clampLimit } from "./limits.js";

describe("output bounds (M-027)", () => {
  describe("clampLimit", () => {
    it("defaults when nothing is asked for", () => {
      expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
    });

    it("clamps to the boundaries", () => {
      expect(clampLimit(1)).toBe(1);
      expect(clampLimit(MAX_LIMIT)).toBe(MAX_LIMIT);
      expect(clampLimit(MAX_LIMIT + 1)).toBe(MAX_LIMIT);
      expect(clampLimit(10_000)).toBe(MAX_LIMIT);
    });

    it("clamps zero and negatives up to one, not down to nothing", () => {
      // Returning an empty list for limit=0 would read as "there are none",
      // which is a different and wrong answer.
      expect(clampLimit(0)).toBe(1);
      expect(clampLimit(-5)).toBe(1);
    });

    it("floors fractional limits", () => {
      expect(clampLimit(3.7)).toBe(3);
    });

    it("treats NaN as absent", () => {
      expect(clampLimit(Number.NaN)).toBe(DEFAULT_LIMIT);
    });
  });

  describe("boundList", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);

    it("truncates and says so", () => {
      const bounded = boundList(items, 10);
      expect(bounded.items).toHaveLength(10);
      expect(bounded.totalCount).toBe(120);
      expect(bounded.truncated).toBe(true);
      expect(bounded.limit).toBe(10);
    });

    it("reports truncated false when everything fits", () => {
      const bounded = boundList(items.slice(0, 5), 10);
      expect(bounded.items).toHaveLength(5);
      expect(bounded.totalCount).toBe(5);
      expect(bounded.truncated).toBe(false);
    });

    it("is not truncated when the list is exactly the limit", () => {
      const bounded = boundList(items.slice(0, 10), 10);
      expect(bounded.truncated).toBe(false);
    });

    it("reports the total even when it exceeds the maximum limit", () => {
      // An agent seeing 500 items must still learn there were 4,000.
      const many = Array.from({ length: 4000 }, (_, i) => i);
      const bounded = boundList(many, 10_000);
      expect(bounded.items).toHaveLength(MAX_LIMIT);
      expect(bounded.totalCount).toBe(4000);
      expect(bounded.truncated).toBe(true);
    });

    it("handles an empty list", () => {
      expect(boundList([], undefined)).toEqual({
        items: [],
        totalCount: 0,
        truncated: false,
        limit: DEFAULT_LIMIT,
      });
    });
  });
});
