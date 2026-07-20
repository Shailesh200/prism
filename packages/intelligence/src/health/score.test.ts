import { describe, expect, it } from "vitest";
import {
  HealthScoreSchema,
  unsafeRepoId,
  type IndexSnapshot,
  type IndexedFile,
} from "@prism/shared";
import { computeHealthScore } from "./score.js";

function emptySnapshot(rootPath: string): IndexSnapshot {
  return {
    repoId: unsafeRepoId("repo:empty"),
    rootPath,
    indexedAt: "2026-07-20T00:00:00.000Z",
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

describe("computeHealthScore (M-015)", () => {
  it("scores empty snapshot without throwing", () => {
    const health = computeHealthScore(emptySnapshot("/tmp/empty"));
    expect(HealthScoreSchema.safeParse(health).success).toBe(true);
    expect(health.factors.map((f) => f.id).sort()).toEqual(
      [
        "coupling",
        "diagnostics",
        "modularity",
        "parse_health",
        "test_presence",
      ].sort(),
    );
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
  });

  it("rewards analyzed sources + tests and no cycles", () => {
    const snapshot: IndexSnapshot = {
      ...emptySnapshot("/tmp/healthy"),
      files: [
        file("src/a.ts"),
        file("src/b.ts"),
        file("src/a.test.ts"),
        file("src/b.test.ts"),
      ],
      stats: {
        filesTotal: 4,
        filesIndexed: 4,
        filesSkipped: 0,
        durationMs: 1,
      },
    };
    const health = computeHealthScore(snapshot);
    expect(health.grade === "A" || health.grade === "B").toBe(true);
    expect(health.factors.find((f) => f.id === "parse_health")?.score).toBe(
      100,
    );
    expect(health.factors.find((f) => f.id === "coupling")?.score).toBe(100);
  });

  it("penalizes cycles and missing tests deterministically", () => {
    const snapshot: IndexSnapshot = {
      ...emptySnapshot("/tmp/coupled"),
      files: [
        file("a.ts", {
          imports: [{ source: "./b.js", specifiers: ["b"] }],
        }),
        file("b.ts", {
          imports: [{ source: "./a.js", specifiers: ["a"] }],
        }),
      ],
      stats: {
        filesTotal: 2,
        filesIndexed: 2,
        filesSkipped: 0,
        durationMs: 1,
      },
    };
    const first = computeHealthScore(snapshot);
    const second = computeHealthScore(snapshot);
    expect(first).toEqual(second);
    expect(first.factors.find((f) => f.id === "coupling")?.score).toBeLessThan(
      100,
    );
    expect(
      first.factors.find((f) => f.id === "test_presence")?.score,
    ).toBeLessThan(50);
  });
});
