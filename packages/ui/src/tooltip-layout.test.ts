import { describe, expect, it } from "vitest";
import { tooltipHugWidth } from "./tooltip-layout.js";

describe("tooltipHugWidth", () => {
  it("sizes to the widest line plus chrome, never a min-width", () => {
    expect(tooltipHugWidth([80, 40], 24, 384)).toBe(104);
    expect(tooltipHugWidth([12], 24, 384)).toBe(36);
  });

  it("caps at max-width when a line would overflow", () => {
    expect(tooltipHugWidth([400], 24, 240)).toBe(240);
    // Long leftover copy wraps in CSS at this cap; hug does not invent a min-width.
    expect(tooltipHugWidth([520], 24, 240)).toBe(240);
  });
});
