import { describe, expect, test } from "vitest";
import { formatPrismDate, relativePrismTime } from "./format-prism-date.js";

describe("formatPrismDate", () => {
  const now = Date.parse("2026-08-09T12:00:00.000Z");

  test("relative matches relativePrismTime", () => {
    const iso = "2026-08-09T11:00:00.000Z";
    expect(formatPrismDate(iso, "relative", now)).toBe(
      relativePrismTime(iso, now),
    );
    expect(formatPrismDate(iso, "relative", now)).toBe("1h ago");
  });

  test("date style returns a short locale date", () => {
    const out = formatPrismDate("2026-08-09T12:00:00.000Z", "date", now);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/2026|Aug|8/);
  });

  test("invalid iso returns empty string", () => {
    expect(formatPrismDate("not-a-date")).toBe("");
  });
});
