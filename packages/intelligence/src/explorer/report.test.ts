import { describe, expect, it } from "vitest";
import {
  CodeExplorerReportSchema,
  unsafeRepoId,
  type GitFileSignal,
  type IndexSnapshot,
  type IndexedFile,
} from "@repo-prism/shared";
import { buildCodeExplorerReport } from "./report.js";

function emptySnapshot(rootPath: string, files: IndexedFile[]): IndexSnapshot {
  return {
    repoId: unsafeRepoId("repo:m023"),
    rootPath,
    indexedAt: "2026-07-22T00:00:00.000Z",
    files,
    stats: {
      filesTotal: files.length,
      filesIndexed: files.length,
      filesSkipped: 0,
      durationMs: 1,
    },
    warnings: [],
  };
}

function file(path: string, overrides: Partial<IndexedFile> = {}): IndexedFile {
  return {
    path,
    pluginId: "typescript",
    contentHash: "x",
    status: "analyzed",
    symbols: [],
    imports: [],
    exports: [],
    references: [],
    diagnostics: [],
    ...overrides,
  };
}

function gitFile(path: string, author = "Ada"): GitFileSignal {
  return {
    path,
    lastCommit: {
      sha: "1",
      author,
      date: "2026-07-22T00:00:00.000Z",
      message: "edit",
    },
    commits: 3,
    additions: 10,
    deletions: 2,
    lastAdditions: 1,
    lastDeletions: 0,
    contributors: [
      { author, commits: 2, additions: 8, deletions: 1 },
      { author: "Bob", commits: 1, additions: 2, deletions: 1 },
    ],
    recent: [
      {
        sha: "1",
        author,
        date: "2026-07-22T00:00:00.000Z",
        message: "edit",
      },
    ],
    weeks: [0, 1, 2],
    recency: 0.8,
  };
}

describe("buildCodeExplorerReport (M-023)", () => {
  it("returns null for unknown file", () => {
    const report = buildCodeExplorerReport({
      snapshot: emptySnapshot("/tmp/m023", [file("a.ts")]),
      target: { kind: "file", path: "missing.ts" },
    });
    expect(report).toBeNull();
  });

  it("builds a schema-valid file report with soft git off", () => {
    const report = buildCodeExplorerReport({
      snapshot: emptySnapshot("/tmp/m023", [
        file("src/widget.ts", {
          symbols: [
            {
              name: "Widget",
              kind: "function",
              start: 0,
              end: 20,
              exported: true,
            },
          ],
          exports: [{ name: "Widget", kind: "function" }],
        }),
        file("src/widget.test.ts"),
      ]),
      target: { kind: "file", path: "src/widget.ts" },
      now: new Date("2026-07-22T12:00:00.000Z"),
    });
    expect(report).not.toBeNull();
    expect(CodeExplorerReportSchema.safeParse(report).success).toBe(true);
    expect(report!.ownership.gitAvailable).toBe(false);
    expect(report!.timeline.gitAvailable).toBe(false);
    expect(
      report!.related.tests.some((t) => t.path === "src/widget.test.ts"),
    ).toBe(true);
  });

  it("fills ownership and timeline from git signals", () => {
    const report = buildCodeExplorerReport({
      snapshot: emptySnapshot("/tmp/m023", [file("a.ts")]),
      target: { kind: "file", path: "a.ts" },
      gitFiles: [gitFile("a.ts", "Ada")],
    });
    expect(report!.ownership.gitAvailable).toBe(true);
    expect(report!.ownership.primary?.author).toBe("Ada");
    expect(report!.timeline.commits.length).toBeGreaterThan(0);
  });

  it("finds similar exports by name", () => {
    const report = buildCodeExplorerReport({
      snapshot: emptySnapshot("/tmp/m023", [
        file("a.ts", {
          symbols: [
            {
              name: "render",
              kind: "function",
              start: 0,
              end: 10,
              exported: true,
            },
          ],
          exports: [{ name: "render", kind: "function" }],
        }),
        file("b.ts", {
          symbols: [
            {
              name: "render",
              kind: "function",
              start: 0,
              end: 10,
              exported: true,
            },
          ],
          exports: [{ name: "render", kind: "function" }],
        }),
      ]),
      target: { kind: "symbol", name: "render", path: "a.ts" },
    });
    expect(
      report!.similar.some((s) => s.path === "b.ts" && s.name === "render"),
    ).toBe(true);
  });
});
