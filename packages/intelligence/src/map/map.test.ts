import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IndexSnapshot, IndexedFile } from "@repo-prism/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildRepoMap, mergeMapEntries } from "./build.js";
import {
  changedPaths,
  readMapCache,
  snapshotKey,
  writeMapCache,
} from "./cache.js";
import { mapHasNoBodies, renderRepoMap } from "./render.js";

function file(path: string, patch: Partial<IndexedFile> = {}): IndexedFile {
  return {
    path,
    pluginId: "typescript",
    contentHash: `h-${path}`,
    status: "analyzed",
    symbols: [
      {
        name: "main",
        kind: "function",
        start: 0,
        end: 40,
        exported: true,
      },
    ],
    imports: [],
    exports: [{ name: "main", kind: "name" }],
    references: [],
    diagnostics: [],
    ...patch,
  };
}

function snap(files: IndexedFile[], root = "/tmp/map-fix"): IndexSnapshot {
  return {
    repoId: "repo:map",
    rootPath: root,
    indexedAt: "2026-10-15T00:00:00.000Z",
    files,
    stats: {
      filesTotal: files.length,
      filesIndexed: files.length,
      filesSkipped: 0,
      durationMs: 0,
    },
    warnings: [],
  };
}

const srcA = "export function main(): void {}\n";
const srcB = "export function main(): number { return 1; }\n";
const srcC = "export function main(): string { return ''; }\n";

describe("repo map (P1)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("MAP-1 deterministic output for a fixture", () => {
    const snapshot = snap([
      file("src/a.ts", { contentHash: "a1" }),
      file("src/b.ts", { contentHash: "b1" }),
      file("src/c.ts", { contentHash: "c1" }),
    ]);
    const imports = [
      { from: "src/a.ts", to: "src/b.ts" },
      { from: "src/c.ts", to: "src/b.ts" },
    ];
    const sources = {
      "src/a.ts": srcA,
      "src/b.ts": srcB,
      "src/c.ts": srcC,
    };
    const once = buildRepoMap({ snapshot, imports, sources });
    const twice = buildRepoMap({ snapshot, imports, sources });
    expect(once.map((e) => e.path)).toEqual(twice.map((e) => e.path));
    expect(once.map((e) => e.rank)).toEqual(twice.map((e) => e.rank));
    // b is imported by both → highest rank
    expect(once[0]?.path).toBe("src/b.ts");
    const rendered = renderRepoMap(once, { snapshotKey: "k", maxTokens: 4000 });
    const again = renderRepoMap(twice, { snapshotKey: "k", maxTokens: 4000 });
    expect(rendered.text).toBe(again.text);
  });

  it("lists a neighbour once when it imports a file twice", () => {
    const snapshot = snap([
      file("src/a.ts", { contentHash: "a1" }),
      file("src/b.ts", { contentHash: "b1" }),
    ]);
    const imports = [
      { from: "src/a.ts", to: "src/b.ts" },
      { from: "src/a.ts", to: "src/b.ts" },
    ];
    const sources = { "src/a.ts": srcA, "src/b.ts": srcB };
    const entries = buildRepoMap({ snapshot, imports, sources });
    const b = entries.find((e) => e.path === "src/b.ts");
    const a = entries.find((e) => e.path === "src/a.ts");
    expect(b?.callers).toEqual(["src/a.ts"]);
    expect(a?.callees).toEqual(["src/b.ts"]);
  });

  it("MAP-2 only changed files re-render", () => {
    const snapshot = snap([
      file("src/a.ts", { contentHash: "a1" }),
      file("src/b.ts", { contentHash: "b1" }),
    ]);
    const imports = [{ from: "src/a.ts", to: "src/b.ts" }];
    const sources = { "src/a.ts": srcA, "src/b.ts": srcB };
    const first = buildRepoMap({ snapshot, imports, sources });
    const nextSnap = snap([
      file("src/a.ts", { contentHash: "a2" }),
      file("src/b.ts", { contentHash: "b1" }),
    ]);
    const changed = changedPaths(first, nextSnap);
    expect(changed.has("src/a.ts")).toBe(true);
    expect(changed.has("src/b.ts")).toBe(false);
    const fresh = buildRepoMap({
      snapshot: nextSnap,
      imports,
      sources: {
        "src/a.ts": "export function main(): void { /*v2*/ }\n",
        "src/b.ts": srcB,
      },
    });
    const merged = mergeMapEntries(first, fresh, changed);
    const bPrev = first.find((e) => e.path === "src/b.ts")!;
    const bMerged = merged.find((e) => e.path === "src/b.ts")!;
    expect(bMerged.signatures).toEqual(bPrev.signatures);
    const aMerged = merged.find((e) => e.path === "src/a.ts")!;
    expect(aMerged.signatures[0]?.signature).toContain("main");
  });

  it("MAP-3 respects maxTokens and keeps highest-rank files", () => {
    const snapshot = snap([
      file("src/a.ts"),
      file("src/b.ts"),
      file("src/c.ts"),
    ]);
    const imports = [
      { from: "src/a.ts", to: "src/b.ts" },
      { from: "src/c.ts", to: "src/b.ts" },
    ];
    const entries = buildRepoMap({
      snapshot,
      imports,
      sources: { "src/a.ts": srcA, "src/b.ts": srcB, "src/c.ts": srcC },
    });
    const tight = renderRepoMap(entries, { snapshotKey: "k", maxTokens: 25 });
    expect(tight.truncated).toBe(true);
    expect(tight.kept).toBeGreaterThanOrEqual(1);
    expect(tight.kept).toBeLessThan(entries.length);
    expect(tight.text).toContain("src/b.ts");
  });

  it("MAP-4 signatures have no bodies", () => {
    const longBody =
      "export function main() {\n" + "  x();\n".repeat(20) + "}\n";
    const snapshot = snap([file("src/a.ts")]);
    const entries = buildRepoMap({
      snapshot,
      imports: [],
      sources: { "src/a.ts": longBody },
    });
    const rendered = renderRepoMap(entries, { snapshotKey: "k" });
    expect(mapHasNoBodies(rendered.text)).toBe(true);
    expect(rendered.text).not.toContain("x();");
  });

  it("MAP-5 cache invalidates on snapshot change", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-map-cache-"));
    dirs.push(dir);
    const snapshot = snap([file("src/a.ts", { contentHash: "a1" })]);
    const entries = buildRepoMap({
      snapshot,
      imports: [],
      sources: { "src/a.ts": srcA },
    });
    const key1 = snapshotKey(snapshot);
    const rendered = renderRepoMap(entries, { snapshotKey: key1 });
    writeMapCache(dir, {
      snapshotKey: key1,
      entries,
      text: rendered.text,
      maxTokens: 4000,
    });
    const hit = readMapCache(dir);
    expect(hit?.snapshotKey).toBe(key1);

    const snapshot2 = snap([file("src/a.ts", { contentHash: "a2" })]);
    const key2 = snapshotKey(snapshot2);
    expect(key2).not.toBe(key1);
    expect(hit?.snapshotKey === key2).toBe(false);
  });

  it("MAP-6 an unchanged repo indexed again keeps the same key", () => {
    const files = [file("src/a.ts", { contentHash: "a1" })];
    const first = snap(files);
    const again = { ...snap(files), indexedAt: "2030-01-01T00:00:00.000Z" };
    expect(snapshotKey(again)).toBe(snapshotKey(first));
    expect(snapshotKey(first, "src/a.ts@abc")).not.toBe(snapshotKey(first));
  });
});
