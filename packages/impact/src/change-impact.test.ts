import {
  unsafeEdgeId,
  unsafeNodeId,
  type GraphEdgeDto,
  type GraphSnapshotDto,
} from "@prism/shared";
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
      { path: "main.ts", reason: "imports app.ts", depth: 1 },
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
      { path: "app.test.ts", reason: "imports app.ts", depth: 2 },
    ]);
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
    const references: ImpactReference[] = Array.from({ length: 5 }, (_, i) => ({
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
