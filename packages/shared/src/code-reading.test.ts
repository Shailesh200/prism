import { describe, expect, it } from "vitest";
import { buildCodeReading } from "./code-reading.js";

describe("buildCodeReading", () => {
  it("keeps the eight riskiest files and the proven wrong results", () => {
    const targets = Array.from({ length: 10 }, (_, i) => ({
      path: `src/f${i}.ts`,
      risk: i,
      callers: [`src/use${i}.ts`],
      tests: [`src/f${i}.test.ts`],
    }));
    targets.push({
      path: ".github/workflows/ci.yml",
      risk: 100,
      callers: ["src/use0.ts"],
      tests: [],
    });
    const reading = buildCodeReading({
      targets,
      proven: [
        {
          what: "A command does the opposite of its job.",
          where: "ci/pipeline.yml",
          fix: "Make the command do that job.",
        },
      ],
      truncated: { total: 400, analysed: 102 },
    });
    expect(reading.order[0]).toBe("correct");
    expect(reading.targets).toHaveLength(8);
    expect(reading.targets[0]?.path).toBe("src/f9.ts");
    expect(reading.targets.some((target) => target.path.endsWith(".yml"))).toBe(
      false,
    );
    expect(reading.proven[0]?.where).toBe("ci/pipeline.yml");
    expect(reading.notes[0]?.severity).toBe("critical");
    expect(reading.notes[0]?.where).toBe("ci/pipeline.yml");
    expect(reading.notes[0]?.breaksWhen).toContain("opposite of its job");
    expect(reading.receipt.verdict).toBe("NO-SHIP");
    expect(reading.notChecked).toContain("298");
    expect(reading.rules.some((rule) => rule.includes("Critical"))).toBe(true);
    expect(
      reading.rules.some((rule) => rule.includes("No case, no finding")),
    ).toBe(true);
  });

  it("stays NOT PROVEN while named files have not been read", () => {
    const reading = buildCodeReading({
      targets: [
        {
          path: "src/a.ts",
          risk: 10,
          callers: ["src/b.ts"],
          tests: [],
        },
      ],
    });
    expect(reading.notes).toHaveLength(0);
    expect(reading.receipt.verdict).toBe("NOT PROVEN");
    expect(reading.receipt.why).toContain("not been read");
  });
});
