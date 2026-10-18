import {
  unsafeEdgeId,
  unsafeNodeId,
  type GraphEdgeDto,
  type GraphSnapshotDto,
} from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import {
  computeBreakingChangeHints,
  computeRenameImpact,
  computeSafeDelete,
  computeTestImpact,
} from "./change-impact.js";
import type { ImpactReference, ImpactSymbol } from "./internal.js";

function edge(
  fromPath: string,
  toPath: string,
  kind: "import" | "re-export" = "import",
): GraphEdgeDto {
  return {
    id: unsafeEdgeId(`${kind}:file:${fromPath}->file:${toPath}`),
    kind,
    from: unsafeNodeId(`file:${fromPath}`),
    to: unsafeNodeId(`file:${toPath}`),
    attrs: {},
  };
}

function graphOf(edges: GraphEdgeDto[]): GraphSnapshotDto {
  return { id: "deps:test", nodes: [], edges };
}

describe("computeSafeDelete", () => {
  // main.ts ─▶ app.ts ─▶ helper.ts, util.ts
  const graph = graphOf([
    edge("app.ts", "helper.ts"),
    edge("app.ts", "util.ts"),
    edge("main.ts", "app.ts"),
  ]);
  const analyzed = ["main.ts", "app.ts", "helper.ts", "util.ts"];

  it("blocks deletion and reports orphaned dependencies", () => {
    const res = computeSafeDelete(
      { kind: "file", id: "app.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.safe).toBe(false);
    expect(res.value.blockers).toEqual([
      {
        path: "main.ts",
        reason: "imports app.ts",
        depth: 1,
        category: "import",
      },
    ]);
    expect(res.value.orphans).toEqual(["helper.ts", "util.ts"]);
    expect(res.value.testsLikelyAffected).toEqual([]);
  });

  it("is safe for a root with no dependents (but flags orphans)", () => {
    const res = computeSafeDelete(
      { kind: "file", id: "main.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.safe).toBe(true);
    expect(res.value.blockers).toEqual([]);
    expect(res.value.orphans).toEqual(["app.ts", "helper.ts", "util.ts"]);
  });

  it("is unsafe for a repo-critical config file with a config blocker", () => {
    const res = computeSafeDelete(
      { kind: "file", id: "package.json" },
      {
        dependencyGraph: graphOf([]),
        analyzedPaths: ["package.json", "src/app.ts"],
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // No import dependents, yet critical → unsafe with a synthetic config blocker.
    expect(res.value.safe).toBe(false);
    expect(res.value.blockers).toEqual([
      {
        path: "package.json",
        reason:
          "tooling-critical config/build file — removing it can break builds, tests, or CI",
        depth: 0,
        category: "config",
      },
    ]);
    expect(res.value.toolingCritical).toBe(true);
  });

  it("keeps both real and config blockers when a critical file has dependents", () => {
    // tooling.ts imports tsconfig.json (unusual, but exercises dedupe + merge).
    const res = computeSafeDelete(
      { kind: "file", id: "tsconfig.json" },
      {
        dependencyGraph: graphOf([edge("tooling.ts", "tsconfig.json")]),
        analyzedPaths: ["tsconfig.json", "tooling.ts"],
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.safe).toBe(false);
    expect(res.value.blockers).toEqual([
      {
        path: "tsconfig.json",
        reason:
          "tooling-critical config/build file — removing it can break builds, tests, or CI",
        depth: 0,
        category: "config",
      },
      {
        path: "tooling.ts",
        reason: "imports tsconfig.json",
        depth: 1,
        category: "import",
      },
    ]);
  });

  it("is unsafe for tooling-critical vitest.config with soft blockers", () => {
    const res = computeSafeDelete(
      { kind: "file", id: "vitest.config.ts" },
      {
        dependencyGraph: graphOf([]),
        analyzedPaths: ["vitest.config.ts", "src/a.test.ts"],
        softEdges: [
          {
            from: "vitest.config.ts",
            to: "src/a.test.ts",
            lane: "test",
            reason: "matched by vitest config",
            confidence: "medium",
            evidence: ["include"],
          },
        ],
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.safe).toBe(false);
    expect(res.value.toolingCritical).toBe(true);
    expect(
      res.value.softBlockers?.some((b) => b.path === "src/a.test.ts"),
    ).toBe(true);
  });

  it("a config that only globs over a file does not block deleting it (round 4)", () => {
    const soft = (evidence: string[]) => ({
      dependencyGraph: graphOf([]),
      analyzedPaths: ["tsconfig.json", "src/dead.ts"],
      softEdges: [
        {
          from: "tsconfig.json",
          to: "src/dead.ts",
          lane: "config" as const,
          reason: "matched by tsconfig include",
          confidence: "medium" as const,
          evidence,
        },
      ],
    });
    const globbed = computeSafeDelete(
      { kind: "file", id: "src/dead.ts" },
      soft(["tsconfig.json#include", "glob: src/**/*"]),
    );
    expect(globbed.ok && globbed.value.safe).toBe(true);
    expect(globbed.ok && globbed.value.blockers).toEqual([]);
    // Named by path, the config does break.
    const named = computeSafeDelete(
      { kind: "file", id: "src/dead.ts" },
      soft(["tsconfig.json#files", "path: src/dead.ts"]),
    );
    expect(named.ok && named.value.safe).toBe(false);
  });

  it("errors for an unknown target", () => {
    const res = computeSafeDelete(
      { kind: "file", id: "ghost.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PRISM_NOT_FOUND");
  });
});

describe("computeSafeDelete entry roles (plan §4.4)", () => {
  // main.ts ─▶ app.ts ─▶ helper.ts, route.tsx ; public/sw.js has no importers
  const graph = graphOf([
    edge("app.ts", "helper.ts"),
    edge("app.ts", "route.tsx"),
    edge("app.ts", "app.config.ts"),
    edge("main.ts", "app.ts"),
  ]);
  const analyzed = [
    "main.ts",
    "app.ts",
    "helper.ts",
    "route.tsx",
    "app.config.ts",
    "public/sw.js",
  ];
  const ctx = {
    dependencyGraph: graph,
    analyzedPaths: analyzed,
    entryRoles: new Map([
      ["public/sw.js", "literal-path"],
      ["route.tsx", "route"],
    ]),
    isOrphanEligible: (p: string) => !p.includes(".config."),
  };

  it("SD-ENTRY-1 a file with no importers but an entry role is not safe", () => {
    const res = computeSafeDelete({ kind: "file", id: "public/sw.js" }, ctx);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.value.safe).toBe(false);
    expect(res.value.entryRole).toBe("literal-path");
  });

  it("SD-ENTRY-2 entry-role and non-source files are never orphaned", () => {
    const res = computeSafeDelete({ kind: "file", id: "app.ts" }, ctx);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.value.orphans).toEqual(["helper.ts"]);
  });

  it("SD-ENTRY-3 a Next page is an entry point, not a dependent of the config globs over it (website round)", () => {
    const page = "app/products/page.tsx";
    const cover = (from: string) => ({
      from,
      to: page,
      lane: "config" as const,
      reason: "included by TypeScript project",
      confidence: "medium" as const,
      evidence: [`${from}#include`],
    });
    const res = computeSafeDelete(
      { kind: "file", id: page },
      {
        dependencyGraph: graphOf([]),
        analyzedPaths: [page, "tsconfig.json", "next.config.mjs"],
        entryRoles: new Map([[page, "route"]]),
        softEdges: [cover("tsconfig.json"), cover("next.config.mjs")],
      },
    );
    if (!res.ok) throw new Error(res.error.message);
    expect(res.value.blockers).toEqual([]);
    expect(res.value.softBlockers).toBeUndefined();
    expect(res.value.entryRole).toBe("route");
  });
});

describe("computeTestImpact", () => {
  const graph = graphOf([
    edge("app.ts", "util.ts"),
    edge("app.test.ts", "app.ts"),
  ]);
  const analyzed = ["util.ts", "app.ts", "app.test.ts"];

  it("returns transitively reachable tests with depth + reason", () => {
    const res = computeTestImpact(
      { kind: "file", id: "util.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.tests).toEqual([
      {
        path: "app.test.ts",
        reason: "imports app.ts",
        depth: 2,
        category: "test",
      },
    ]);
  });

  it("P9 WHY-1 test_impact every test has a non-empty reason", () => {
    const res = computeTestImpact(
      { kind: "file", id: "util.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.tests.length).toBeGreaterThan(0);
    for (const row of res.value.tests) {
      expect(row.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("computeTestImpact co-change (P7)", () => {
  const graph = graphOf([edge("app.test.ts", "app.ts")]);
  const analyzed = ["app.ts", "app.test.ts", "e2e/flow.test.ts", "b.ts"];
  const coChange = (p: string) =>
    p === "app.ts"
      ? [
          { path: "app.test.ts", together: 4, jaccard: 0.9 },
          { path: "e2e/flow.test.ts", together: 3, jaccard: 0.5 },
          { path: "b.ts", together: 3, jaccard: 0.4 },
          { path: "e2e/rare.test.ts", together: 2, jaccard: 0.1 },
        ]
      : [];

  it("adds tests that change with the file, above the Jaccard floor", () => {
    const res = computeTestImpact(
      { kind: "file", id: "app.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed, coChange },
    );
    if (!res.ok) throw new Error(res.error.message);
    expect(res.value.tests.map((t) => t.path)).toEqual([
      "app.test.ts",
      "e2e/flow.test.ts",
    ]);
    expect(res.value.tests[1]).toEqual({
      path: "e2e/flow.test.ts",
      reason: "changed together with app.ts in 3 commits",
      depth: 1,
      category: "test",
      lane: "test",
      confidence: "medium",
      evidence: ["co-change jaccard 0.50"],
    });
  });

  it("leaves a symbol's test impact to the symbol walk", () => {
    const res = computeTestImpact(
      { kind: "symbol", id: "app.ts#run" },
      {
        dependencyGraph: graph,
        analyzedPaths: analyzed,
        coChange,
        symbols: [],
        references: [],
      },
    );
    if (res.ok)
      expect(res.value.tests.map((t) => t.path)).not.toContain(
        "e2e/flow.test.ts",
      );
  });
});

describe("computeTestImpact symbol walk (plan §4.3)", () => {
  const named = (from: string, to: string, imported: string[]) => ({
    ...edge(from, to),
    attrs: { imported },
  });
  const graph = graphOf([
    {
      ...edge("index.ts", "debounce.ts", "re-export"),
      attrs: { reexports: [{ from: "*", as: "*" }] },
    },
    {
      ...edge("index.ts", "nth.ts", "re-export"),
      attrs: { reexports: [{ from: "*", as: "*" }] },
    },
    named("debounce.spec.ts", "index.ts", ["debounce"]),
    named("nth.spec.ts", "index.ts", ["nth"]),
  ]);
  const ctx = {
    dependencyGraph: graph,
    analyzedPaths: [
      "index.ts",
      "debounce.ts",
      "nth.ts",
      "debounce.spec.ts",
      "nth.spec.ts",
    ],
    fileExports: new Map([
      ["debounce.ts", ["debounce"]],
      ["nth.ts", ["nth"]],
    ]),
  };

  it("TI-SYM-1 only tests that bind the changed symbol, with viaSymbol", () => {
    const res = computeTestImpact({ kind: "file", id: "debounce.ts" }, ctx);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.value.tests.map((t) => [t.path, t.viaSymbol])).toEqual([
      ["debounce.spec.ts", "debounce"],
    ]);
    expect(res.value.run).toEqual([]);
    expect(res.value.runNote).toMatch(/^1 test with no runner/);
  });

  it("TI-SYM-2 run holds a command for exactly the reached tests when the runner is known", () => {
    const res = computeTestImpact(
      { kind: "file", id: "debounce.ts" },
      {
        ...ctx,
        testPackages: [{ dir: "", runner: "vitest", hasTestScript: true }],
        packageManager: "npm",
      },
    );
    if (!res.ok) throw new Error(res.error.message);
    expect(res.value.run).toEqual([
      {
        cwd: ".",
        command: "npx vitest run debounce.spec.ts",
        argv: ["npx", "vitest", "run", "debounce.spec.ts"],
        scope: "files",
        runner: "vitest",
        tests: ["debounce.spec.ts"],
      },
    ]);
    expect(res.value.runNote).toBeUndefined();
  });
});

describe("computeRenameImpact", () => {
  const graph = graphOf([edge("cli.ts", "main.ts")]);
  const analyzed = ["helper.ts", "main.ts", "cli.ts"];
  const symbols: ImpactSymbol[] = [
    {
      id: "symbol:helper.ts:add:0",
      name: "add",
      path: "helper.ts",
      kind: "function",
      exported: true,
    },
  ];
  const references: ImpactReference[] = [
    {
      name: "add",
      path: "main.ts",
      targetSymbolId: "symbol:helper.ts:add:0",
      kind: "call",
    },
    {
      name: "add",
      path: "cli.ts",
      targetSymbolId: "symbol:helper.ts:add:0",
      kind: "call",
    },
  ];

  it("lists the declaration and each reference file as edit sites", () => {
    const res = computeRenameImpact(
      { kind: "symbol", id: "add", path: "helper.ts", newName: "sum" },
      { dependencyGraph: graph, analyzedPaths: analyzed, symbols, references },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.newName).toBe("sum");
    expect(res.value.editSites).toEqual([
      { path: "cli.ts", count: 1 },
      { path: "helper.ts", count: 1 },
      { path: "main.ts", count: 1 },
    ]);
    expect(res.value.affectedFiles).toEqual(["cli.ts", "helper.ts", "main.ts"]);
    expect(res.value.breakingChanges).toEqual([
      {
        kind: "exported-symbol",
        severity: "warning",
        message:
          '"add" is exported; changing or removing it may break importers.',
      },
    ]);
  });

  it("reports importers as edit sites for a file rename", () => {
    const res = computeRenameImpact(
      { kind: "file", id: "main.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.editSites).toEqual([{ path: "cli.ts", count: 1 }]);
    expect(res.value.breakingChanges).toEqual([]);
  });

  it("flags foundational config files as breaking even with no importers", () => {
    const res = computeRenameImpact(
      { kind: "file", id: "package.json" },
      {
        dependencyGraph: graphOf([]),
        analyzedPaths: ["package.json", "src/app.ts"],
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.breakingChanges.map((h) => h.kind)).toEqual([
      "foundational-config",
    ]);
  });

  it("flags renaming an exported symbol used across many files", () => {
    const widelySymbols: ImpactSymbol[] = [
      {
        id: "symbol:helper.ts:add:0",
        name: "add",
        path: "helper.ts",
        kind: "function",
        exported: true,
      },
    ];
    const widelyRefs: ImpactReference[] = ["a.ts", "b.ts", "c.ts"].map(
      (path) => ({
        name: "add",
        path,
        targetSymbolId: "symbol:helper.ts:add:0",
        kind: "call",
      }),
    );
    const res = computeRenameImpact(
      { kind: "symbol", id: "add", path: "helper.ts", newName: "sum" },
      {
        dependencyGraph: graphOf([]),
        analyzedPaths: ["helper.ts", "a.ts", "b.ts", "c.ts"],
        symbols: widelySymbols,
        references: widelyRefs,
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rename = res.value.breakingChanges.find(
      (h) => h.kind === "rename-breaking",
    );
    expect(rename).toEqual({
      kind: "rename-breaking",
      severity: "warning",
      message:
        "Renaming an exported symbol used in 3 files is a breaking change for importers.",
    });
  });
});

describe("computeBreakingChangeHints", () => {
  const graph = graphOf([]);
  const analyzed = ["base.ts", "impl.ts"];

  it("flags exported + subclassed symbols", () => {
    const symbols: ImpactSymbol[] = [
      {
        id: "symbol:base.ts:Base:0",
        name: "Base",
        path: "base.ts",
        kind: "class",
        exported: true,
      },
    ];
    const references: ImpactReference[] = [
      {
        name: "Base",
        path: "impl.ts",
        targetSymbolId: "symbol:base.ts:Base:0",
        kind: "extends",
      },
    ];
    const res = computeBreakingChangeHints(
      { kind: "symbol", id: "Base", path: "base.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed, symbols, references },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((h) => h.kind)).toEqual([
      "exported-symbol",
      "subclassed",
    ]);
    expect(res.value.find((h) => h.kind === "subclassed")?.severity).toBe(
      "danger",
    );
  });

  it("flags widely-used symbols", () => {
    const symbols: ImpactSymbol[] = [
      {
        id: "s1",
        name: "helper",
        path: "u.ts",
        kind: "function",
        exported: false,
      },
    ];
    const references: ImpactReference[] = Array.from({ length: 3 }, (_, i) => ({
      name: "helper",
      path: `c${i}.ts`,
      targetSymbolId: "s1",
      kind: "call",
    }));
    const res = computeBreakingChangeHints(
      { kind: "symbol", id: "s1" },
      { dependencyGraph: graph, analyzedPaths: analyzed, symbols, references },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((h) => h.kind)).toEqual(["widely-used"]);
  });
});
