import {
  unsafeEdgeId,
  unsafeNodeId,
  type GraphEdgeDto,
  type GraphSnapshotDto,
} from "@prism/shared";
import { describe, expect, it } from "vitest";
import {
  computeBlastRadius,
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
    // Untested leaf (15) + config boost/floor → High band (>= 60).
    expect(res.value.affectedFiles).toEqual([]);
    expect(res.value.risk).toBeGreaterThanOrEqual(60);
    // Config origin emits a danger config-change hint (no affected files → no untested).
    expect(res.value.breakingChanges).toEqual([
      {
        kind: "config-change",
        severity: "danger",
        message:
          "Editing a build/config file (package.json) can affect the whole workspace build.",
      },
    ]);
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
});
