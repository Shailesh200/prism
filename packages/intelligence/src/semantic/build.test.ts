import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IndexSnapshot } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { buildKnowledgeGraph, findReferences, findSymbol } from "./build.js";

function snapshot(
  rootPath: string,
  files: IndexSnapshot["files"],
): IndexSnapshot {
  return {
    repoId: "repo:m011",
    rootPath,
    indexedAt: "2026-01-01T00:00:00.000Z",
    files,
    stats: {
      filesTotal: files.length,
      filesIndexed: files.filter((f) => f.status === "analyzed").length,
      filesSkipped: 0,
      durationMs: 0,
    },
    warnings: [],
  };
}

function analyzed(
  path: string,
  partial: Partial<IndexSnapshot["files"][number]> = {},
): IndexSnapshot["files"][number] {
  return {
    path,
    pluginId: "typescript",
    contentHash: "h",
    status: "analyzed",
    symbols: [],
    imports: [],
    exports: [],
    references: [],
    diagnostics: [],
    ...partial,
  };
}

describe("buildKnowledgeGraph", () => {
  it("resolves call references across files and exposes stats", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-m011-"));
    const snap = snapshot(root, [
      analyzed("helper.ts", {
        symbols: [
          {
            name: "add",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ],
        exports: [{ name: "add", kind: "name" }],
      }),
      analyzed("main.ts", {
        symbols: [
          {
            name: "run",
            kind: "function",
            start: 50,
            end: 90,
            exported: true,
          },
        ],
        imports: [{ source: "./helper.ts", specifiers: ["add"] }],
        references: [{ name: "add", kind: "call", start: 70, end: 73 }],
      }),
    ]);

    const kg = buildKnowledgeGraph(snap);
    expect(kg.stats.nodes).toBeGreaterThan(0);
    expect(kg.stats.edges).toBeGreaterThan(0);
    expect(kg.stats.nodesByKind.file).toBe(2);
    expect(kg.stats.nodesByKind.symbol).toBe(2);
    expect(kg.stats.edgesByKind.defines).toBe(2);
    expect(kg.stats.edgesByKind.references).toBe(1);

    const syms = findSymbol(kg, { name: "add" });
    expect(syms).toHaveLength(1);
    expect(syms[0]?.path).toBe("helper.ts");

    const refs = findReferences(kg, { name: "add", path: "helper.ts" });
    expect(refs).toEqual([
      expect.objectContaining({
        name: "add",
        kind: "call",
        path: "main.ts",
        start: 70,
        end: 73,
        targetSymbolId: syms[0]?.id,
      }),
    ]);
  });

  it("adds tests edges for *.test.ts imports", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-m011-test-"));
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "noop"), "");
    const snap = snapshot(root, [
      analyzed("main.ts", {
        symbols: [
          { name: "run", kind: "function", start: 0, end: 10, exported: true },
        ],
      }),
      analyzed("main.test.ts", {
        imports: [{ source: "./main.ts", specifiers: ["run"] }],
        references: [{ name: "run", kind: "call", start: 20, end: 23 }],
      }),
    ]);
    const kg = buildKnowledgeGraph(snap);
    expect(
      kg.graph.edges.some(
        (e) =>
          e.kind === "tests" &&
          e.from === "file:main.test.ts" &&
          e.to === "file:main.ts",
      ),
    ).toBe(true);
  });

  it("creates extends edges between class symbols", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-m011-ext-"));
    const snap = snapshot(root, [
      analyzed("types.ts", {
        symbols: [
          {
            name: "Base",
            kind: "class",
            start: 0,
            end: 30,
            exported: true,
          },
          {
            name: "Child",
            kind: "class",
            start: 40,
            end: 100,
            exported: true,
          },
        ],
        references: [{ name: "Base", kind: "extends", start: 55, end: 59 }],
      }),
    ]);
    const kg = buildKnowledgeGraph(snap);
    const edge = kg.graph.edges.find((e) => e.kind === "extends");
    expect(edge?.from).toContain("Child");
    expect(edge?.to).toContain("Base");
  });
});
