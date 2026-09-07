import { describe, expect, it } from "vitest";
import {
  CUSTOM_RANGE_PRESET,
  formatRangeAbs,
  fromDatetimeLocalValue,
  presetLabel,
  toDatetimeLocalValue,
} from "./date-range.js";

describe("date-range helpers", () => {
  it("round-trips a local datetime without a timezone suffix", () => {
    const ms = Date.parse("2026-09-07T06:52:00.000Z");
    const local = toDatetimeLocalValue(ms);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const back = fromDatetimeLocalValue(local);
    expect(back).toBeDefined();
    expect(Math.abs((back ?? 0) - ms)).toBeLessThan(60_000);
  });

  it("names an unbounded window All time", () => {
    expect(
      formatRangeAbs({ startMs: Number.NEGATIVE_INFINITY, endMs: Date.now() }),
    ).toBe("All time");
  });

  it("joins finite bounds with an en dash", () => {
    const start = Date.parse("2026-09-07T10:00:00.000Z");
    const end = Date.parse("2026-09-07T11:00:00.000Z");
    const label = formatRangeAbs({ startMs: start, endMs: end }, end);
    expect(label).toContain("—");
    expect(label).not.toBe("All time");
    expect(label).not.toBe("Custom");
  });

  it("returns undefined for a malformed datetime-local value", () => {
    expect(fromDatetimeLocalValue("nope")).toBeUndefined();
    expect(toDatetimeLocalValue(Number.NEGATIVE_INFINITY)).toBe("");
  });

  it("labels a custom preset", () => {
    expect(presetLabel([{ id: "1h", label: "Last 1 hour" }], "1h")).toBe(
      "Last 1 hour",
    );
    expect(presetLabel([], CUSTOM_RANGE_PRESET)).toBe("Custom");
  });
});
