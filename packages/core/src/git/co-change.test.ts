import { describe, expect, it } from "vitest";
import { buildCoChange, CO_CHANGE_MAX_FILES } from "./co-change.js";
import { parseGitLog } from "./git-signals.js";

const REC = "\u001e";
const SEP = "\u001f";
const commit = (sha: string, ...paths: string[]): string =>
  [
    `${REC}${sha}${SEP}Ada${SEP}ada@example.com${SEP}2026-01-01T00:00:00Z${SEP}m`,
    ...paths.map((p) => `1\t0\t${p}`),
  ].join("\n");

describe("co-change (P7)", () => {
  it("CC-1: Jaccard over the commits two files share", () => {
    const index = buildCoChange([
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts", "c.ts"],
      ["a.ts"],
      ["a.ts", "c.ts"],
    ]);
    // a: 4 commits, b: 2, together 2 → 2 / (4 + 2 - 2).
    expect(index.partners("a.ts")).toEqual([
      { path: "b.ts", together: 2, jaccard: 0.5 },
      { path: "c.ts", together: 2, jaccard: 0.5 },
    ]);
    expect(index.partners("b.ts")).toEqual([
      { path: "a.ts", together: 2, jaccard: 0.5 },
    ]);
    // b and c share one commit: below the minimum, not a partner.
    expect(index.partners("c.ts").map((p) => p.path)).toEqual(["a.ts"]);
    expect(index.partners("missing.ts")).toEqual([]);
  });

  it("CC-1: parseGitLog builds it from numstat, keeping only indexed paths", () => {
    const log = [
      commit("s1", "src/a.ts", "src/b.ts", "README.md"),
      commit("s2", "src/a.ts", "src/b.ts", "README.md"),
      "",
    ].join("\n");
    const git = parseGitLog(log, {
      now: Date.parse("2026-01-02T00:00:00Z"),
      keepPaths: new Set(["src/a.ts", "src/b.ts"]),
    });
    expect(git.coChange?.partners("src/a.ts")).toEqual([
      { path: "src/b.ts", together: 2, jaccard: 1 },
    ]);
    expect(
      parseGitLog(log, { now: 0, coChange: false }).coChange,
    ).toBeUndefined();
  });

  it("CC-2: commits touching more than 30 files are ignored", () => {
    const sweep = Array.from(
      { length: CO_CHANGE_MAX_FILES + 1 },
      (_, i) => `f${i}.ts`,
    );
    const index = buildCoChange([
      sweep,
      sweep,
      ["f0.ts", "f1.ts"],
      ["f0.ts", "f1.ts"],
    ]);
    // Only the two small commits count: f0 and f1 always change together.
    expect(index.partners("f0.ts")).toEqual([
      { path: "f1.ts", together: 2, jaccard: 1 },
    ]);
    expect(index.partners("f2.ts")).toEqual([]);
  });

  it("CC-2: the size cut counts files outside the index too", () => {
    const docs = Array.from(
      { length: CO_CHANGE_MAX_FILES },
      (_, i) => `d${i}.md`,
    );
    const index = buildCoChange(
      [
        ["a.ts", "b.ts", ...docs],
        ["a.ts", "b.ts", ...docs],
      ],
      new Set(["a.ts", "b.ts"]),
    );
    expect(index.partners("a.ts")).toEqual([]);
  });
});
