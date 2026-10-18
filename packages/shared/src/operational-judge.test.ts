import { describe, expect, it } from "vitest";
import { judgeOperational, selectReviewPaths } from "./operational-judge.js";

const SKIP = `{
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- apps/website"
}`;

describe("judgeOperational", () => {
  it("flags an ignore command whose path is the project directory", () => {
    const [finding] = judgeOperational("apps/website/vercel.json", SKIP);
    expect(finding?.riskIfSkipped).toBe("high");
    expect(finding?.where).toBe("apps/website/vercel.json");
    expect(finding?.fix).toContain("-- .");
  });

  it("accepts a pathspec of dot, which is the project directory", () => {
    const text = SKIP.replace("apps/website", ".");
    expect(judgeOperational("apps/website/vercel.json", text)).toEqual([]);
  });

  it("accepts a repo-root vercel.json that names a folder", () => {
    expect(judgeOperational("vercel.json", SKIP)).toEqual([]);
  });

  it("flags a workflow job that is turned off", () => {
    const text =
      "jobs:\n  publish:\n    if: false\n    runs-on: ubuntu-latest\n";
    const [finding] = judgeOperational(
      ".github/workflows/publish-npm.yml",
      text,
    );
    expect(finding?.sources).toEqual(["judge:workflow-disabled"]);
  });

  it("ignores if: false inside a comment", () => {
    const text =
      "jobs:\n  publish:\n    # if: false\n    runs-on: ubuntu-latest\n";
    expect(judgeOperational(".github/workflows/publish-npm.yml", text)).toEqual(
      [],
    );
  });
});

describe("selectReviewPaths", () => {
  it("keeps operational files when the diff is larger than the source cap", () => {
    const paths = [
      "apps/website/vercel.json",
      ".github/workflows/publish-npm.yml",
      ...Array.from({ length: 400 }, (_, i) => `packages/src/f${i}.ts`),
    ];
    const selected = selectReviewPaths(paths, () => 0);
    expect(selected.analysed).toContain("apps/website/vercel.json");
    expect(selected.analysed).toContain(".github/workflows/publish-npm.yml");
    expect(selected.truncated?.total).toBe(402);
    expect(selected.analysed.length).toBeGreaterThan(100);
  });

  it("returns a small diff whole", () => {
    const paths = ["a.ts", "apps/website/vercel.json"];
    expect(selectReviewPaths(paths, () => 1).truncated).toBeUndefined();
  });
});
