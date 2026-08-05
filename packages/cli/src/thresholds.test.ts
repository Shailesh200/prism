import { RISK_BAND_MIN } from "@prism/shared";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  bound,
  meetsThreshold,
  parseFailOn,
  parseFailOnCount,
  parseLimit,
  truncationNote,
} from "./thresholds.js";

function value<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error("expected ok");
  return result.value as T;
}

describe("parseFailOn", () => {
  it("accepts each band", () => {
    expect(value(parseFailOn("low"))).toBe("low");
    expect(value(parseFailOn("mid"))).toBe("mid");
    expect(value(parseFailOn("high"))).toBe("high");
  });

  it("is forgiving about case and stray whitespace", () => {
    expect(value(parseFailOn("  HIGH "))).toBe("high");
  });

  it("means 'never fail' when absent", () => {
    expect(value(parseFailOn(undefined))).toBeUndefined();
  });

  it("names the valid values when given something else", () => {
    const result = parseFailOn("severe");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("low, mid, high");
    expect(result.error.message).toContain("severe");
  });
});

describe("meetsThreshold", () => {
  it("never fires without a threshold", () => {
    expect(meetsThreshold(100, undefined)).toBe(false);
  });

  it("fires at or above the band, not merely above it", () => {
    expect(meetsThreshold(RISK_BAND_MIN.high, "high")).toBe(true);
    expect(meetsThreshold(RISK_BAND_MIN.high - 1, "high")).toBe(false);
    expect(meetsThreshold(RISK_BAND_MIN.mid, "mid")).toBe(true);
    expect(meetsThreshold(RISK_BAND_MIN.mid - 1, "mid")).toBe(false);
  });

  it("treats a higher band as satisfying a lower threshold", () => {
    expect(meetsThreshold(95, "low")).toBe(true);
    expect(meetsThreshold(95, "mid")).toBe(true);
  });

  it("fires for everything at --fail-on low, since every score is at least low", () => {
    expect(meetsThreshold(0, "low")).toBe(true);
  });
});

describe("parseFailOnCount", () => {
  it("reads 'any' as one", () => {
    expect(value(parseFailOnCount("any"))).toBe(1);
  });

  it("reads a number", () => {
    expect(value(parseFailOnCount("5"))).toBe(5);
  });

  it("allows zero, which fails on a clean result too", () => {
    expect(value(parseFailOnCount("0"))).toBe(0);
  });

  it("rejects negatives and words", () => {
    expect(parseFailOnCount("-1").ok).toBe(false);
    expect(parseFailOnCount("lots").ok).toBe(false);
  });
});

describe("parseLimit", () => {
  it("defaults rather than being unbounded", () => {
    expect(value(parseLimit(undefined))).toBe(DEFAULT_LIMIT);
  });

  it("caps at the maximum, so --limit 999999 cannot flood a terminal", () => {
    expect(value(parseLimit("999999"))).toBe(MAX_LIMIT);
  });

  it("rejects zero, negatives and words", () => {
    expect(parseLimit("0").ok).toBe(false);
    expect(parseLimit("-3").ok).toBe(false);
    expect(parseLimit("many").ok).toBe(false);
  });
});

describe("bound", () => {
  it("keeps the true total when it truncates", () => {
    const result = bound([1, 2, 3, 4, 5], 2);
    expect(result.items).toEqual([1, 2]);
    expect(result.totalCount).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it("does not claim truncation when everything fits", () => {
    expect(bound([1, 2], 2).truncated).toBe(false);
  });

  it("says how many were hidden and how to see them", () => {
    expect(truncationNote(bound([1, 2, 3, 4, 5], 2), "files")).toContain(
      "3 more files",
    );
    expect(truncationNote(bound([1, 2, 3, 4, 5], 2), "files")).toContain(
      "--limit",
    );
  });

  it("says nothing when nothing was hidden", () => {
    expect(truncationNote(bound([1], 5), "files")).toBe("");
  });
});
