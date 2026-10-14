import { describe, expect, it } from "vitest";
import { renderReportCard } from "./first-run.js";

describe("renderReportCard", () => {
  it("names a cycle, an untested file, and an orphan", () => {
    const text = renderReportCard({
      repository: "fixture",
      health: {
        score: 72,
        grade: "C",
        factors: [
          { id: "tests", label: "Tests", score: 40 },
          { id: "complexity", label: "Complexity", score: 80 },
        ],
      },
      domains: ["web"],
      report: {
        repository: "fixture",
        indexedAt: "2026-10-12T00:00:00.000Z",
        connected: [],
        cycles: [["src/a.ts", "src/b.ts"]],
        orphans: ["src/lonely.ts"],
        untestedHotspots: [{ path: "src/hot.ts", importedBy: 4 }],
        loneCrossPackage: [],
      },
    });
    expect(text).toContain("health 72 (C)");
    expect(text).toContain("Cycle  src/a.ts");
    expect(text).toContain("Untested  src/hot.ts");
    expect(text).toContain("Orphan  src/lonely.ts");
    expect(text.split("\n").every((line) => [...line].length <= 80)).toBe(true);
  });
});
