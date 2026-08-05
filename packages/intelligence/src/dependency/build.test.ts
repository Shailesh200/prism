import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IndexSnapshot } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { buildDependencyGraph } from "./build.js";

function snapshot(
  rootPath: string,
  files: IndexSnapshot["files"],
): IndexSnapshot {
  return {
    repoId: "repo:test",
    rootPath,
    indexedAt: "2026-01-01T00:00:00.000Z",
    files,
    stats: {
      filesTotal: files.length,
      filesIndexed: files.filter((f) => f.status === "analyzed").length,
      filesSkipped: files.filter((f) => f.status !== "analyzed").length,
      durationMs: 0,
    },
    warnings: [],
  };
}

function analyzed(
  path: string,
  imports: Array<{ source: string; specifiers?: string[] }> = [],
  exports: Array<{ name: string; kind?: string; source?: string }> = [],
): IndexSnapshot["files"][number] {
  return {
    path,
    pluginId: "typescript",
    contentHash: "h",
    status: "analyzed",
    symbols: [],
    imports: imports.map((i) => ({
      source: i.source,
      specifiers: i.specifiers ?? [],
    })),
    exports: exports.map((e) => ({
      name: e.name,
      kind: e.kind ?? "re-export",
      ...(e.source === undefined ? {} : { source: e.source }),
    })),
    references: [],
    diagnostics: [],
  };
}

describe("buildDependencyGraph", () => {
  it("builds file graph and detects cycles (golden)", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-m010-"));
    const snap = snapshot(root, [
      analyzed("a.ts", [{ source: "./b.ts" }]),
      analyzed("b.ts", [{ source: "./c.ts" }]),
      analyzed("c.ts", [{ source: "./a.ts" }]),
    ]);

    const result = buildDependencyGraph(snap);
    expect(result.graph.nodes.map((n) => n.id).sort()).toEqual([
      "file:a.ts",
      "file:b.ts",
      "file:c.ts",
    ]);
    expect(result.graph.edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual([
      "file:a.ts->file:b.ts",
      "file:b.ts->file:c.ts",
      "file:c.ts->file:a.ts",
    ]);
    expect(result.cycles).toEqual([["file:a.ts", "file:b.ts", "file:c.ts"]]);
  });

  it("includes re-export edges", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-m010-re-"));
    const snap = snapshot(root, [
      analyzed("barrel.ts", [], [{ name: "x", source: "./impl.ts" }]),
      analyzed("impl.ts"),
    ]);
    const result = buildDependencyGraph(snap);
    expect(result.graph.edges).toEqual([
      expect.objectContaining({
        kind: "re-export",
        from: "file:barrel.ts",
        to: "file:impl.ts",
      }),
    ]);
  });

  it("package aggregation mode uses local package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-m010-pkg-"));
    mkdirSync(join(root, "packages/alpha/src"), { recursive: true });
    mkdirSync(join(root, "packages/beta/src"), { recursive: true });
    writeFileSync(
      join(root, "packages/alpha/package.json"),
      JSON.stringify({ name: "@fix/alpha" }),
    );
    writeFileSync(
      join(root, "packages/beta/package.json"),
      JSON.stringify({ name: "@fix/beta" }),
    );
    writeFileSync(join(root, "packages/alpha/src/a.ts"), "export {};");
    writeFileSync(join(root, "packages/beta/src/b.ts"), "export {};");

    const snap = snapshot(root, [
      analyzed("packages/alpha/src/a.ts", [{ source: "../../beta/src/b.ts" }]),
      analyzed("packages/beta/src/b.ts", [{ source: "../../alpha/src/a.ts" }]),
      {
        path: "packages/alpha/package.json",
        pluginId: null,
        contentHash: "p",
        status: "skipped_unsupported",
        symbols: [],
        imports: [],
        exports: [],
        references: [],
        diagnostics: [],
      },
      {
        path: "packages/beta/package.json",
        pluginId: null,
        contentHash: "p",
        status: "skipped_unsupported",
        symbols: [],
        imports: [],
        exports: [],
        references: [],
        diagnostics: [],
      },
    ]);

    const result = buildDependencyGraph(snap, { packageAggregation: true });
    expect(result.graph.nodes.map((n) => n.id).sort()).toEqual([
      "pkg:@fix/alpha",
      "pkg:@fix/beta",
    ]);
    expect(result.cycles).toEqual([["pkg:@fix/alpha", "pkg:@fix/beta"]]);
  });

  it("resolves bare package imports to the package entry index file", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-m049-pkg-entry-"));
    mkdirSync(join(root, "packages/foo/src"), { recursive: true });
    mkdirSync(join(root, "apps/web/src"), { recursive: true });
    writeFileSync(
      join(root, "packages/foo/package.json"),
      JSON.stringify({
        name: "@fixture/foo",
        main: "./src/index.ts",
        exports: { ".": "./src/index.ts" },
      }),
    );
    writeFileSync(
      join(root, "apps/web/package.json"),
      JSON.stringify({ name: "@fixture/web" }),
    );
    writeFileSync(
      join(root, "packages/foo/src/bar.ts"),
      "export function bar() { return 1; }",
    );
    writeFileSync(
      join(root, "packages/foo/src/index.ts"),
      'export { bar } from "./bar.js";',
    );
    writeFileSync(
      join(root, "apps/web/src/app.ts"),
      'import { bar } from "@fixture/foo";\nexport const x = bar();',
    );

    const snap = snapshot(root, [
      analyzed(
        "packages/foo/src/index.ts",
        [],
        [{ name: "bar", source: "./bar.js" }],
      ),
      analyzed("packages/foo/src/bar.ts"),
      analyzed("apps/web/src/app.ts", [
        { source: "@fixture/foo", specifiers: ["bar"] },
      ]),
      {
        path: "packages/foo/package.json",
        pluginId: null,
        contentHash: "p",
        status: "skipped_unsupported",
        symbols: [],
        imports: [],
        exports: [],
        references: [],
        diagnostics: [],
      },
      {
        path: "apps/web/package.json",
        pluginId: null,
        contentHash: "p",
        status: "skipped_unsupported",
        symbols: [],
        imports: [],
        exports: [],
        references: [],
        diagnostics: [],
      },
    ]);

    const result = buildDependencyGraph(snap);
    expect(
      result.graph.edges.map((e) => `${e.from}->${e.to}:${e.kind}`).sort(),
    ).toEqual([
      "file:apps/web/src/app.ts->file:packages/foo/src/index.ts:import",
      "file:packages/foo/src/index.ts->file:packages/foo/src/bar.ts:re-export",
    ]);
    expect(
      result.unresolved.filter((u) => u.source === "@fixture/foo"),
    ).toEqual([]);
  });
});

// The graph is memoised per snapshot object (M-035). The failure mode that
// matters is not a slow cache, it is a stale one: a reindex whose result is
// answered from the previous snapshot's graph.
describe("buildDependencyGraph — memoisation", () => {
  const root = mkdtempSync(join(tmpdir(), "prism-memo-"));

  it("returns the same object for the same snapshot", () => {
    const snap = snapshot(root, [
      analyzed("a.ts", [{ source: "./b.ts" }]),
      analyzed("b.ts"),
    ]);

    expect(buildDependencyGraph(snap)).toBe(buildDependencyGraph(snap));
  });

  it("rebuilds for a new snapshot even when it looks identical", () => {
    const files = [analyzed("a.ts", [{ source: "./b.ts" }]), analyzed("b.ts")];
    // Same timestamp, same contents, different object — which is exactly what a
    // reindex inside one millisecond produces.
    const first = buildDependencyGraph(snapshot(root, files));
    const second = buildDependencyGraph(snapshot(root, files));

    expect(second).not.toBe(first);
    expect(second.graph.edges).toEqual(first.graph.edges);
  });

  it("sees a changed snapshot rather than the cached answer", () => {
    const before = buildDependencyGraph(
      snapshot(root, [
        analyzed("a.ts", [{ source: "./b.ts" }]),
        analyzed("b.ts"),
      ]),
    );
    const after = buildDependencyGraph(
      snapshot(root, [analyzed("a.ts"), analyzed("b.ts")]),
    );

    expect(before.graph.edges).toHaveLength(1);
    expect(after.graph.edges).toHaveLength(0);
  });

  it("keeps graphs for different options apart", () => {
    const snap = snapshot(root, [
      analyzed("a.ts", [{ source: "./b.ts" }]),
      analyzed("b.ts"),
    ]);

    const files = buildDependencyGraph(snap, { packageAggregation: false });
    const packages = buildDependencyGraph(snap, { packageAggregation: true });

    expect(packages).not.toBe(files);
    expect(buildDependencyGraph(snap, { packageAggregation: true })).toBe(
      packages,
    );
  });
});
