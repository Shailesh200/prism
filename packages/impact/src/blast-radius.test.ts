import {
  unsafeEdgeId,
  unsafeNodeId,
  type GraphEdgeDto,
  type GraphSnapshotDto,
} from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import {
  BLAST_COVERAGE_LIMITATIONS,
  computeBlastRadius,
  FORWARD_DEPENDENCIES_LIMIT,
  type ImpactReference,
  type ImpactSymbol,
} from "./blast-radius.js";

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

// app.ts ─┐            app.test.ts ─▶ app.ts
// service ─┼▶ util.ts   util.test.ts ─▶ util.ts
const ANALYZED = [
  "util.ts",
  "app.ts",
  "service.ts",
  "app.test.ts",
  "util.test.ts",
];
const GRAPH = graphOf([
  edge("app.ts", "util.ts"),
  edge("service.ts", "util.ts"),
  edge("app.test.ts", "app.ts"),
  edge("util.test.ts", "util.ts"),
]);

describe("computeBlastRadius — file target", () => {
  it("collects transitive dependents with depth + reasons", () => {
    const res = computeBlastRadius(
      { kind: "file", id: "util.ts" },
      { dependencyGraph: GRAPH, analyzedPaths: ANALYZED },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const report = res.value;

    expect(report.origin).toEqual({
      kind: "file",
      id: "util.ts",
      path: "util.ts",
    });
    expect(report.affectedFiles).toEqual([
      {
        path: "app.ts",
        reason: "imports util.ts",
        depth: 1,
        category: "import",
      },
      {
        path: "service.ts",
        reason: "imports util.ts",
        depth: 1,
        category: "import",
      },
      {
        path: "util.test.ts",
        reason: "imports util.ts",
        depth: 1,
        category: "test",
      },
      {
        path: "app.test.ts",
        reason: "imports app.ts",
        depth: 2,
        category: "test",
      },
    ]);
    expect(report.testsLikelyAffected).toEqual(["app.test.ts", "util.test.ts"]);
    expect(report.truncated).toBeUndefined();
    // 3 direct dependents (>= WIDELY_USED_THRESHOLD); tests present, not config.
    expect(report.breakingChanges).toEqual([
      {
        kind: "widely-used",
        severity: "warning",
        message:
          "3 files depend directly on this; breaking its contract impacts many callers.",
      },
    ]);
  });

  it("accepts a `file:` prefixed id", () => {
    const res = computeBlastRadius(
      { kind: "file", id: "file:util.ts" },
      { dependencyGraph: GRAPH, analyzedPaths: ANALYZED },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.origin.path).toBe("util.ts");
    expect(res.value.affectedFiles).toHaveLength(4);
  });

  it("scores risk from reach + fan-in + test presence", () => {
    // 4 affected of 4 candidates → reachRatio 1 → 55; 3 direct deps → 15; tests present → 0.
    const res = computeBlastRadius(
      { kind: "file", id: "util.ts" },
      { dependencyGraph: GRAPH, analyzedPaths: ANALYZED },
    );
    expect(res.ok && res.value.risk).toBe(70);
  });

  it("adds the untested-change penalty when no tests are affected", () => {
    // Leaf change with no dependents and no tests → 0 + 0 + 15.
    const res = computeBlastRadius(
      { kind: "file", id: "app.test.ts" },
      { dependencyGraph: GRAPH, analyzedPaths: ANALYZED },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.affectedFiles).toEqual([]);
    expect(res.value.risk).toBe(15);
  });

  it("errors when the file is not in the index", () => {
    const res = computeBlastRadius(
      { kind: "file", id: "ghost.ts" },
      { dependencyGraph: GRAPH, analyzedPaths: ANALYZED },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PRISM_NOT_FOUND");
  });

  it("boosts risk for foundational config files even with no dependents", () => {
    const analyzed = ["package.json", "src/app.ts"];
    const res = computeBlastRadius(
      { kind: "file", id: "package.json" },
      { dependencyGraph: graphOf([]), analyzedPaths: analyzed },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Critical tooling floor → High band (>= 70).
    expect(res.value.affectedFiles).toEqual([]);
    expect(res.value.risk).toBeGreaterThanOrEqual(70);
    expect(res.value.breakingChanges).toEqual([
      {
        kind: "config-change",
        severity: "danger",
        message:
          "Editing a build/config file (package.json) can affect the whole workspace build.",
      },
    ]);
  });

  it("scores vitest.config soft matches at Mid/High and never as isolated leaf", () => {
    const analyzed = [
      "vitest.config.ts",
      "src/a.test.ts",
      "src/b.test.ts",
      "src/util.ts",
    ];
    const softEdges = [
      {
        from: "vitest.config.ts",
        to: "src/a.test.ts",
        lane: "test" as const,
        reason: "matched by vitest config include/testMatch",
        confidence: "medium" as const,
        evidence: ["vitest.config.ts#include", "glob: src/**/*.test.ts"],
      },
      {
        from: "vitest.config.ts",
        to: "src/b.test.ts",
        lane: "test" as const,
        reason: "matched by vitest config include/testMatch",
        confidence: "medium" as const,
        evidence: ["vitest.config.ts#include", "glob: src/**/*.test.ts"],
      },
    ];
    const res = computeBlastRadius(
      { kind: "file", id: "vitest.config.ts" },
      {
        dependencyGraph: graphOf([]),
        analyzedPaths: analyzed,
        softEdges,
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.risk).toBeGreaterThanOrEqual(45);
    expect(res.value.softAffectedCount).toBe(2);
    expect(res.value.testsLikelyAffected).toEqual([
      "src/a.test.ts",
      "src/b.test.ts",
    ]);
    expect(res.value.affectedFiles.some((f) => f.lane === "test")).toBe(true);
  });

  it("classifies affected files by category (reexport, type, config, test)", () => {
    // barrel re-exports util; app + a .d.ts + a config depend on the barrel.
    const analyzed = [
      "util.ts",
      "barrel.ts",
      "app.ts",
      "types.d.ts",
      "vite.config.ts",
      "barrel.test.ts",
    ];
    const graph = graphOf([
      edge("barrel.ts", "util.ts", "re-export"),
      edge("app.ts", "util.ts"),
      edge("types.d.ts", "util.ts"),
      edge("vite.config.ts", "util.ts"),
      edge("barrel.test.ts", "util.ts"),
    ]);
    const res = computeBlastRadius(
      { kind: "file", id: "util.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byPath = new Map(
      res.value.affectedFiles.map((f) => [f.path, f.category]),
    );
    expect(byPath.get("barrel.ts")).toBe("reexport");
    expect(byPath.get("app.ts")).toBe("import");
    expect(byPath.get("types.d.ts")).toBe("type");
    expect(byPath.get("vite.config.ts")).toBe("config");
    expect(byPath.get("barrel.test.ts")).toBe("test");
  });

  it("honours typeOnly edge attrs for .d.ts importers (P-E7)", () => {
    const analyzed = ["runtime.ts", "ambient.d.ts"];
    const graph = graphOf([
      {
        id: "import:file:ambient.d.ts->file:runtime.ts",
        kind: "import",
        from: "file:ambient.d.ts",
        to: "file:runtime.ts",
        attrs: { source: "./runtime.ts", typeOnly: true },
      },
    ]);
    const res = computeBlastRadius(
      { kind: "file", id: "runtime.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const hit = res.value.affectedFiles.find((f) => f.path === "ambient.d.ts");
    expect(hit?.category).toBe("type");
    expect(hit?.lane).toBe("type");
  });
});

describe("computeBlastRadius — depth limit + truncation", () => {
  // a -> b -> c -> d -> origin (chain of importers)
  const chain = graphOf([
    edge("b.ts", "origin.ts"),
    edge("c.ts", "b.ts"),
    edge("d.ts", "c.ts"),
    edge("e.ts", "d.ts"),
  ]);
  const analyzed = ["origin.ts", "b.ts", "c.ts", "d.ts", "e.ts"];

  it("stops at maxDepth and marks the report truncated", () => {
    const res = computeBlastRadius(
      { kind: "file", id: "origin.ts" },
      { dependencyGraph: chain, analyzedPaths: analyzed, maxDepth: 2 },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.affectedFiles.map((f) => f.path)).toEqual([
      "b.ts",
      "c.ts",
    ]);
    expect(res.value.truncated).toBe(true);
    // Untested (warning) + partial (info), sorted by severity then message.
    expect(res.value.breakingChanges).toEqual([
      {
        kind: "untested",
        severity: "warning",
        message: "No tests appear to cover the affected files.",
      },
      {
        kind: "partial",
        severity: "info",
        message: "Impact traversal hit the depth limit; results are partial.",
      },
    ]);
  });

  it("is not truncated when the limit covers the whole chain", () => {
    const res = computeBlastRadius(
      { kind: "file", id: "origin.ts" },
      { dependencyGraph: chain, analyzedPaths: analyzed, maxDepth: 10 },
    );
    expect(res.ok && res.value.truncated).toBeUndefined();
    expect(res.ok && res.value.affectedFiles).toHaveLength(4);
  });
});

describe("computeBlastRadius — symbol target", () => {
  const symbols: ImpactSymbol[] = [
    { id: "symbol:helper.ts:add:0", name: "add", path: "helper.ts" },
  ];
  const references: ImpactReference[] = [
    { name: "add", path: "main.ts", targetSymbolId: "symbol:helper.ts:add:0" },
    { name: "add", path: "cli.ts", targetSymbolId: "symbol:helper.ts:add:0" },
  ];
  // cli.ts imports main.ts; main.ts + cli.ts reference `add`.
  const graph = graphOf([edge("cli.ts", "main.ts")]);
  const analyzed = ["helper.ts", "main.ts", "cli.ts"];

  it("seeds reference files and cascades their dependents", () => {
    const res = computeBlastRadius(
      { kind: "symbol", id: "symbol:helper.ts:add:0" },
      { dependencyGraph: graph, analyzedPaths: analyzed, symbols, references },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.origin).toEqual({
      kind: "symbol",
      id: "symbol:helper.ts:add:0",
      path: "helper.ts",
    });
    expect(res.value.affectedFiles).toEqual([
      {
        path: "cli.ts",
        reason: "references add",
        depth: 1,
        category: "import",
      },
      {
        path: "main.ts",
        reason: "references add",
        depth: 1,
        category: "import",
      },
    ]);
  });

  it("resolves a symbol by bare name", () => {
    const res = computeBlastRadius(
      { kind: "symbol", id: "add", path: "helper.ts" },
      { dependencyGraph: graph, analyzedPaths: analyzed, symbols, references },
    );
    expect(res.ok && res.value.origin.path).toBe("helper.ts");
  });

  it("errors for an unknown symbol", () => {
    const res = computeBlastRadius(
      { kind: "symbol", id: "missing" },
      { dependencyGraph: graph, analyzedPaths: analyzed, symbols, references },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PRISM_NOT_FOUND");
  });

  it("refuses homonym name seeds and sets resolutionNote (P-A3)", () => {
    const homonymSymbols: ImpactSymbol[] = [
      { id: "symbol:a.ts:shared:0", name: "shared", path: "a.ts" },
      { id: "symbol:b.ts:shared:0", name: "shared", path: "b.ts" },
    ];
    const homonymRefs: ImpactReference[] = [
      {
        name: "shared",
        path: "use-a.ts",
        targetSymbolId: "symbol:a.ts:shared:0",
      },
      {
        name: "shared",
        path: "use-b.ts",
        targetSymbolId: "symbol:b.ts:shared:0",
      },
      // Unresolved same-name ref must NOT seed via name fallback
      { name: "shared", path: "noise.ts", targetSymbolId: null },
    ];
    const res = computeBlastRadius(
      { kind: "symbol", id: "shared" },
      {
        dependencyGraph: graphOf([]),
        analyzedPaths: ["a.ts", "b.ts", "use-a.ts", "use-b.ts", "noise.ts"],
        symbols: homonymSymbols,
        references: homonymRefs,
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.affectedFiles).toEqual([]);
    expect(res.value.resolutionNote).toMatch(/Ambiguous symbol name 'shared'/);

    const resolved = computeBlastRadius(
      { kind: "symbol", id: "symbol:a.ts:shared:0" },
      {
        dependencyGraph: graphOf([]),
        analyzedPaths: ["a.ts", "b.ts", "use-a.ts", "use-b.ts", "noise.ts"],
        symbols: homonymSymbols,
        references: homonymRefs,
      },
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.affectedFiles.map((f) => f.path)).toEqual([
      "use-a.ts",
    ]);
    expect(resolved.value.resolutionNote).toBeUndefined();
  });
});

describe("computeBlastRadius — M-049 depth fields", () => {
  it("sets originRole, forwardDependencies, and scenario checklist", () => {
    const res = computeBlastRadius(
      { kind: "file", id: "util.ts" },
      { dependencyGraph: GRAPH, analyzedPaths: ANALYZED },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.originRole).toBe("source");
    expect(res.value.intent).toBe("edit");
    expect(res.value.forwardDependencies ?? []).toEqual([]);
    expect(res.value.scenarioChecklist?.some((s) => s.id === "tests")).toBe(
      true,
    );
  });

  it("lists hard out-edges as forwardDependencies", () => {
    const res = computeBlastRadius(
      { kind: "file", id: "app.ts" },
      { dependencyGraph: GRAPH, analyzedPaths: ANALYZED },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.forwardDependencies?.map((d) => d.path)).toEqual([
      "util.ts",
    ]);
    expect(res.value.forwardDependencies?.[0]?.kind).toBe("import");
    expect(res.value.coverageLimitations).toEqual([
      ...BLAST_COVERAGE_LIMITATIONS,
    ]);
  });

  it("caps forwardDependencies and reports truncation (M-056 / P-A5)", () => {
    const many = Array.from(
      { length: FORWARD_DEPENDENCIES_LIMIT + 5 },
      (_, i) => edge("hub.ts", `dep-${String(i).padStart(3, "0")}.ts`),
    );
    const res = computeBlastRadius(
      { kind: "file", id: "hub.ts" },
      {
        dependencyGraph: graphOf(many),
        analyzedPaths: [
          "hub.ts",
          ...many.map((_, i) => `dep-${String(i).padStart(3, "0")}.ts`),
        ],
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.forwardDependencies).toHaveLength(
      FORWARD_DEPENDENCIES_LIMIT,
    );
    expect(res.value.forwardDependenciesTruncated).toBe(true);
    expect(res.value.forwardDependenciesTotalCount).toBe(
      FORWARD_DEPENDENCIES_LIMIT + 5,
    );
  });

  it("applies entry role floor and delete intent bump", () => {
    const analyzed = ["main.ts"];
    const edit = computeBlastRadius(
      { kind: "file", id: "main.ts" },
      { dependencyGraph: graphOf([]), analyzedPaths: analyzed },
    );
    expect(edit.ok && edit.value.originRole).toBe("entry");
    expect(edit.ok && edit.value.risk).toBeGreaterThanOrEqual(35);

    const del = computeBlastRadius(
      { kind: "file", id: "util.ts" },
      {
        dependencyGraph: GRAPH,
        analyzedPaths: ANALYZED,
        intent: "delete",
      },
    );
    const editUtil = computeBlastRadius(
      { kind: "file", id: "util.ts" },
      { dependencyGraph: GRAPH, analyzedPaths: ANALYZED, intent: "edit" },
    );
    expect(del.ok).toBe(true);
    expect(editUtil.ok).toBe(true);
    if (!del.ok || !editUtil.ok) return;
    expect(del.value.intent).toBe("delete");
    expect(del.value.risk).toBe(Math.min(100, editUtil.value.risk + 5));
  });
});
