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
    const reading = buildCodeReading({
      targets,
      proven: [
        {
          what: "The build is skipped.",
          where: "apps/website/vercel.json",
          fix: "Use -- .",
        },
      ],
      truncated: { total: 400, analysed: 102 },
    });
    expect(reading.order[0]).toBe("correct");
    expect(reading.targets).toHaveLength(8);
    expect(reading.targets[0]?.path).toBe("src/f9.ts");
    expect(reading.proven[0]?.where).toBe("apps/website/vercel.json");
    expect(reading.notChecked).toContain("298");
    expect(
      reading.rules.some((rule) => rule.includes("No case, no finding")),
    ).toBe(true);
  });
});
