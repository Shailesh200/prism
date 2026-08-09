import { describe, expect, it } from "vitest";
import { formatIndexProgress } from "./index-progress.js";

describe("formatIndexProgress (M-057 P-B5)", () => {
  it("includes phase and file counts", () => {
    expect(
      formatIndexProgress({
        phase: "analyze",
        filesDone: 3,
        filesTotal: 10,
        path: "src/a.ts",
      }),
    ).toBe("index:analyze 3/10 src/a.ts");
  });

  it("prefers message over path", () => {
    expect(
      formatIndexProgress({
        phase: "inventory",
        filesDone: 5,
        filesTotal: 5,
        message: "Inventory complete",
        path: "src/a.ts",
      }),
    ).toBe("index:inventory 5/5 Inventory complete");
  });
});
