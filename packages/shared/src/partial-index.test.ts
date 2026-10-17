import { describe, expect, it } from "vitest";
import {
  partialIndexLine,
  partialIndexOf,
  partialIndexWarning,
} from "./partial-index.js";

describe("partial index flag (round 4)", () => {
  it("round-trips the indexer's warning", () => {
    const w = partialIndexWarning(500, 900);
    expect(partialIndexOf(["ignored 3 path(s)", w])).toEqual({
      analyzed: 500,
      total: 900,
    });
  });

  it("is null for a complete index", () => {
    expect(partialIndexOf([])).toBeNull();
    expect(partialIndexOf(undefined)).toBeNull();
    expect(partialIndexOf(["ignored 3 path(s) via ignore rules"])).toBeNull();
  });

  it("says what is missing and how to finish", () => {
    expect(partialIndexLine({ analyzed: 500, total: 900 })).toBe(
      "Prism · the index is partial (500 of 900 code files), so files outside it are missing. Run `prism index` to finish it.",
    );
  });
});
