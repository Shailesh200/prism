import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const actionModule = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../action/render-comment.mjs",
);

describe("action/render-comment.mjs (M-060)", () => {
  it("renders risk band, per-file blast, and tests from review JSON", async () => {
    const { renderReviewComment, STICKY_MARKER } = await import(
      pathToFileURL(actionModule).href
    );

    const md = renderReviewComment({
      ok: true,
      data: {
        base: "origin/main",
        overallRisk: 72,
        totalAffectedFiles: 3,
        totalTestsAffected: 2,
        items: [
          {
            path: "packages/core/src/index.ts",
            risk: 72,
            affectedFilesCount: 3,
            testsLikelyAffected: [
              "packages/core/src/index.test.ts",
              "packages/cli/src/cli.integration.test.ts",
            ],
          },
          {
            path: "packages/cli/src/sarif.ts",
            risk: 12,
            affectedFilesCount: 0,
            testsLikelyAffected: [],
          },
        ],
      },
    });

    expect(md).toContain(STICKY_MARKER);
    expect(md).toContain("72/100");
    expect(md).toContain("High");
    expect(md).toContain("packages/core/src/index.ts");
    expect(md).toContain("### Tests to run");
    expect(md).toContain("packages/core/src/index.test.ts");
  });
});
