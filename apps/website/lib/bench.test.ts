import { describe, expect, it } from "vitest";
import {
  CURSOR_REVIEW_FOUND,
  CURSOR_REVIEW_TOKENS,
  GROUPS,
  HABITS_RAN,
  OPENCODE_B6_SOLVED,
  OPENCODE_B6_TOKENS,
  OPENCODE_R3_TOKENS,
  formatChange,
  verdict,
} from "./bench";

describe("benchmark changes", () => {
  it("computes the relative change from the raw values", () => {
    expect(formatChange(OPENCODE_R3_TOKENS)).toBe("−28 %");
    expect(formatChange(CURSOR_REVIEW_FOUND)).toBe("+33 %");
    expect(formatChange(CURSOR_REVIEW_TOKENS)).toBe("−32 %");
    expect(formatChange(OPENCODE_B6_SOLVED)).toBe("+14 %");
    expect(formatChange(OPENCODE_B6_TOKENS)).toBe("−26 %");
  });

  it("calls lower tokens and more problems found a win", () => {
    for (const m of [OPENCODE_R3_TOKENS, CURSOR_REVIEW_FOUND, HABITS_RAN])
      expect(verdict(m)).toBe("win");
  });

  it("keeps the losses in the full detail", () => {
    const all = GROUPS.flatMap((g) => g.measures);
    expect(all.filter((m) => verdict(m) === "loss").length).toBeGreaterThan(5);
    const cost = all.find((m) => m.label === "Median cost");
    expect(cost && verdict(cost)).toBe("loss");
  });
});
