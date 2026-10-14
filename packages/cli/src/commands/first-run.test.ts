import { describe, expect, it } from "vitest";
import { firstRunLine } from "./first-run.js";

describe("first run (CLI-5)", () => {
  it("prints one line with the file count, the time and the next step", () => {
    const line = firstRunLine(5012, 12_345);
    expect(line).toBe("Indexed 5012 files in 12.3 s. Try: prism review");
    expect(line.includes("\n")).toBe(false);
    expect(line).not.toMatch(/health/i);
  });
});
