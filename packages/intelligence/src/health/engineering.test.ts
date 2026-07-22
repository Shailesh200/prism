import { describe, expect, it } from "vitest";
import {
  EngineeringHealthReportSchema,
  unsafeRepoId,
  type GitFileSignal,
  type IndexSnapshot,
  type IndexedFile,
} from "@prism/shared";
import { computeEngineeringHealth } from "./engineering.js";

function emptySnapshot(rootPath: string): IndexSnapshot {
  return {
    repoId: unsafeRepoId("repo:m022"),
    rootPath,
    indexedAt: "2026-07-22T00:00:00.000Z",
    files: [],
    stats: {
      filesTotal: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
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

function gitFile(
  path: string,
  partial: Partial<GitFileSignal> & { commits: number },
): GitFileSignal {
  return {
    path,
    lastCommit: {
      sha: "abc",
      author: "A",
      date: "2026-07-22T00:00:00.000Z",
      message: "x",
    },
    commits: partial.commits,
    additions: partial.additions ?? 0,
    deletions: partial.deletions ?? 0,
    lastAdditions: 0,
    lastDeletions: 0,
    contributors: partial.contributors ?? [
      { author: "A", commits: partial.commits, additions: 0, deletions: 0 },
    ],
    recent: [],
    weeks: [],
    recency: partial.recency ?? 0.5,
  };
}

describe("computeEngineeringHealth (M-022)", () => {
  it("returns a schema-valid report without git (neutral git metrics)", () => {
    const report = computeEngineeringHealth({
      snapshot: {
        ...emptySnapshot("/tmp/m022"),
        files: [
          file("src/a.ts", {
            imports: [{ source: "./b", specifiers: ["b"] }],
          }),
          file("src/b.ts"),
          file("src/c.test.ts"),
        ],
        stats: {
          filesTotal: 3,
          filesIndexed: 3,
          filesSkipped: 0,
          durationMs: 1,
        },
      },
      now: new Date("2026-07-22T00:00:00.000Z"),
    });
    expect(EngineeringHealthReportSchema.safeParse(report).success).toBe(true);
    expect(report.gitAvailable).toBe(false);
    expect(report.metrics.map((m) => m.id).sort()).toEqual([
      "architecture_drift",
      "code_churn",
      "conflict_risk",
      "entropy",
      "knowledge_decay",
      "technical_debt",
    ]);
    const churn = report.metrics.find((m) => m.id === "code_churn");
    expect(churn?.score).toBe(50);
    expect(churn?.gitDependent).toBe(true);
  });

  it("scores technical debt from failed files and diagnostics", () => {
    const report = computeEngineeringHealth({
      snapshot: {
        ...emptySnapshot("/tmp/debt"),
        files: [
          file("ok.ts"),
          file("bad.ts", {
            status: "failed",
            diagnostics: [{ message: "parse error", severity: "error" }],
          }),
        ],
        stats: {
          filesTotal: 2,
          filesIndexed: 1,
          filesSkipped: 0,
          durationMs: 1,
        },
      },
    });
    const debt = report.metrics.find((m) => m.id === "technical_debt")!;
    expect(debt.score).toBeLessThan(90);
    expect(debt.evidence.some((e) => e.includes("failed_or_skipped=1"))).toBe(
      true,
    );
  });

  it("scores code churn concentration from git signals", () => {
    const report = computeEngineeringHealth({
      snapshot: {
        ...emptySnapshot("/tmp/churn"),
        files: [file("hot.ts"), file("cold.ts"), file("mid.ts")],
        stats: {
          filesTotal: 3,
          filesIndexed: 3,
          filesSkipped: 0,
          durationMs: 1,
        },
      },
      gitFiles: [
        gitFile("hot.ts", { commits: 20, additions: 900, deletions: 100 }),
        gitFile("cold.ts", { commits: 1, additions: 2, deletions: 0 }),
        gitFile("mid.ts", { commits: 2, additions: 5, deletions: 1 }),
      ],
    });
    expect(report.gitAvailable).toBe(true);
    const churn = report.metrics.find((m) => m.id === "code_churn")!;
    expect(churn.score).toBeLessThan(40);
    expect(report.hotspots[0]?.path).toBe("hot.ts");
  });

  it("flags conflict risk for multi-author hot files", () => {
    const report = computeEngineeringHealth({
      snapshot: {
        ...emptySnapshot("/tmp/conflict"),
        files: [file("crowd.ts")],
        stats: {
          filesTotal: 1,
          filesIndexed: 1,
          filesSkipped: 0,
          durationMs: 1,
        },
      },
      gitFiles: [
        gitFile("crowd.ts", {
          commits: 8,
          additions: 40,
          deletions: 10,
          contributors: [
            { author: "A", commits: 3, additions: 0, deletions: 0 },
            { author: "B", commits: 3, additions: 0, deletions: 0 },
            { author: "C", commits: 2, additions: 0, deletions: 0 },
          ],
        }),
      ],
    });
    const conflict = report.metrics.find((m) => m.id === "conflict_risk")!;
    expect(conflict.score).toBeLessThan(80);
    expect(conflict.evidence.some((e) => e.includes("multi_author"))).toBe(
      true,
    );
  });

  it("scores knowledge decay for stale high fan-in files", () => {
    const report = computeEngineeringHealth({
      snapshot: {
        ...emptySnapshot("/tmp/decay"),
        files: [
          file("hub.ts"),
          file("a.ts", {
            imports: [{ source: "./hub", specifiers: ["x"] }],
          }),
          file("b.ts", {
            imports: [{ source: "./hub", specifiers: ["x"] }],
          }),
          file("c.ts", {
            imports: [{ source: "./hub", specifiers: ["x"] }],
          }),
        ],
        stats: {
          filesTotal: 4,
          filesIndexed: 4,
          filesSkipped: 0,
          durationMs: 1,
        },
      },
      gitFiles: [
        gitFile("hub.ts", {
          commits: 2,
          additions: 1,
          deletions: 0,
          recency: 0.05,
          contributors: [
            { author: "Only", commits: 2, additions: 0, deletions: 0 },
          ],
        }),
      ],
    });
    const decay = report.metrics.find((m) => m.id === "knowledge_decay")!;
    expect(decay.score).toBeLessThanOrEqual(70);
  });
});
