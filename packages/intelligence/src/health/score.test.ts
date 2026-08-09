import { describe, expect, it } from "vitest";
import {
  HealthScoreSchema,
  unsafeRepoId,
  type IndexSnapshot,
  type IndexedFile,
} from "@repo-prism/shared";
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

  it("keeps parse_health neutral (50) for an empty repo, like its siblings", () => {
    const health = computeHealthScore(emptySnapshot("/tmp/empty"));
    const parseHealth = health.factors.find((f) => f.id === "parse_health");
    // "No indexed files" is not a failure — every empty-case factor sits at 50.
    expect(parseHealth?.score).toBe(50);
    expect(parseHealth?.note).toBe("No indexed files");
    for (const f of health.factors) {
      expect(f.score).toBe(50);
    }
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

  it("includes explainable breakdown on factors", () => {
    const snapshot: IndexSnapshot = {
      ...emptySnapshot("/tmp/breakdown"),
      files: [
        file("src/a.ts"),
        file("src/a.test.ts"),
        file("src/skip.ts", { status: "failed" }),
      ],
      stats: {
        filesTotal: 3,
        filesIndexed: 2,
        filesSkipped: 1,
        durationMs: 1,
      },
    };
    const health = computeHealthScore(snapshot);
    expect(HealthScoreSchema.safeParse(health).success).toBe(true);

    for (const f of health.factors) {
      expect(f.breakdown?.length).toBeGreaterThan(0);
    }

    const testPresence = health.factors.find((f) => f.id === "test_presence");
    expect(testPresence?.breakdown).toEqual(
      expect.arrayContaining([
        { label: "Test files", value: 1 },
        { label: "Source files", value: 2 },
      ]),
    );

    const parseHealth = health.factors.find((f) => f.id === "parse_health");
    expect(parseHealth?.breakdown).toEqual(
      expect.arrayContaining([
        { label: "Analyzed (ok)", value: 2 },
        { label: "Failed / skipped", value: 1 },
      ]),
    );

    const coupling = health.factors.find((f) => f.id === "coupling");
    expect(coupling?.breakdown?.some((b) => b.label === "Graph nodes")).toBe(
      true,
    );
    expect(coupling?.breakdown?.some((b) => b.label === "Graph edges")).toBe(
      true,
    );
  });

  it("labels coupling as TS/JS import coupling and reports graphCoveragePct (M-056)", () => {
    const snapshot: IndexSnapshot = {
      ...emptySnapshot("/tmp/polyglot"),
      files: [
        file("app.ts"),
        file("main.go", {
          pluginId: null,
          status: "skipped_unsupported",
        }),
        file("util.py", {
          pluginId: null,
          status: "skipped_unsupported",
        }),
      ],
      stats: {
        filesTotal: 3,
        filesIndexed: 1,
        filesSkipped: 2,
        durationMs: 1,
      },
    };
    const health = computeHealthScore(snapshot);
    expect(health.graphCoveragePct).toBe(33);
    expect(health.factors.find((f) => f.id === "coupling")?.label).toBe(
      "TS/JS import coupling",
    );
    expect(
      health.factors
        .find((f) => f.id === "parse_health")
        ?.breakdown?.some((b) => b.label === "Unresolved imports"),
    ).toBe(true);
  });

  it("does not penalize modularity when features are inference-only (M-061)", () => {
    const snapshot: IndexSnapshot = {
      ...emptySnapshot("/tmp/inferred-features"),
      files: [
        file("lib/alpha/a.ts", {
          imports: [{ source: "./b.js", specifiers: [] }],
        }),
        file("lib/alpha/b.ts", {
          imports: [{ source: "./a.js", specifiers: [] }],
        }),
        file("lib/beta/c.ts", {
          imports: [{ source: "./d.js", specifiers: [] }],
        }),
        file("lib/beta/d.ts", {
          imports: [{ source: "./c.js", specifiers: [] }],
        }),
      ],
      stats: {
        filesTotal: 4,
        filesIndexed: 4,
        filesSkipped: 0,
        durationMs: 1,
      },
    };
    const health = computeHealthScore(snapshot);
    const modularity = health.factors.find((f) => f.id === "modularity");
    expect(modularity?.score).toBeGreaterThanOrEqual(50);
    expect(modularity?.note).toMatch(/inferred/i);
  });

  it("prefers TestingReport score for test_presence when provided", () => {
    const snapshot: IndexSnapshot = {
      ...emptySnapshot("/tmp/testing-report"),
      files: [file("src/a.ts")],
      stats: {
        filesTotal: 1,
        filesIndexed: 1,
        filesSkipped: 0,
        durationMs: 1,
      },
    };
    const fallback = computeHealthScore(snapshot);
    const withReport = computeHealthScore(snapshot, {
      testingReport: {
        score: 88,
        runners: ["vitest"],
        suites: [{ kind: "unit", path: "src", fileCount: 4 }],
        results: [],
        summary: "Vitest unit suites",
      },
    });
    expect(
      withReport.factors.find((f) => f.id === "test_presence")?.score,
    ).toBe(88);
    expect(
      fallback.factors.find((f) => f.id === "test_presence")?.score,
    ).not.toBe(88);
  });
});
