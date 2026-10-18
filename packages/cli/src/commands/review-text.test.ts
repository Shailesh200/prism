import { describe, expect, it } from "vitest";
import { buildCodeReading, type CodeReading } from "@repo-prism/shared";
import { renderReviewReading } from "./review-text.js";

function text(reading: CodeReading): string {
  return renderReviewReading(reading, { color: false, limit: 8 }).join("\n");
}

describe("renderReviewReading", () => {
  it("prints one Receipt at the end and lists each finding", () => {
    const reading = buildCodeReading({
      targets: [
        {
          path: "src/a.ts",
          risk: 10,
          callers: ["src/b.ts"],
          tests: [],
        },
      ],
      proven: [
        {
          what: "A command does the opposite of its job.",
          where: "ci/pipeline.yml",
          fix: "Make the command do that job.",
        },
      ],
    });
    const printed = text(reading);
    expect(printed).not.toContain("· Receipt");
    expect(printed.split("\n").filter((line) => line === "Receipt")).toEqual([
      "Receipt",
    ]);
    expect(printed.indexOf(reading.receipt.why)).toBeLessThan(
      printed.lastIndexOf("\nReceipt"),
    );
    expect(
      printed.endsWith(
        "NO-SHIP\nFix the Critical findings, then review again.",
      ),
    ).toBe(true);
    expect(printed).toContain("1 finding\n");
    expect(printed).toContain("Critical\n");
    expect(printed).toContain(
      "1. A command does the opposite of its job. (`ci/pipeline.yml`)",
    );
    expect(printed).toContain("   - This code: This file decides what runs.");
    expect(printed).toContain("   - Breaks when:");
    expect(printed).toContain("   - Change: Make the command do that job.");
    expect(printed).toContain("   - Left as is:");
    expect(printed).toContain("- src/a.ts");
  });

  it("keeps the explanation when there is no finding yet", () => {
    const reading = buildCodeReading({
      targets: [
        {
          path: "src/a.ts",
          risk: 10,
          callers: [],
          tests: [],
        },
      ],
    });
    const printed = text(reading);
    expect(printed).toContain("0 findings\n");
    expect(printed).not.toContain("Critical");
    expect(printed).toContain("The named files have not been read yet.");
    expect(
      printed.endsWith(
        "NOT PROVEN\nRead them, then write any findings in this same shape.",
      ),
    ).toBe(true);
  });
});
