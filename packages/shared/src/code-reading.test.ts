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
    expect(reading.notChecked).toContain("298");
    expect(reading.rules.at(-1)).toContain("measured reach");
    expect(
      reading.rules.some((rule) => rule.includes("No case, no finding")),
    ).toBe(true);
  });
});
