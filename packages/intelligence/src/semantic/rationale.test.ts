import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexSnapshot, IndexedFile } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { collectRationale } from "./rationale.js";
import { buildKnowledgeGraph } from "./build.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/m075-rationale",
);

function file(path: string, analyzed = true): IndexedFile {
  return {
    path,
    pluginId: analyzed ? "typescript" : "none",
    contentHash: "h",
    status: analyzed ? "analyzed" : "skipped_unsupported",
    symbols: analyzed
      ? [
          {
            name: "fetchUser",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ]
      : [],
    imports: [],
    exports: analyzed ? [{ name: "fetchUser", kind: "name" }] : [],
    references: [],
    diagnostics: [],
  };
}

function snapshot(): IndexSnapshot {
  return {
    repoId: "repo:m075",
    rootPath: FIXTURE,
    indexedAt: "2026-09-17T00:00:00.000Z",
    files: [
      file("src/users/fetchUser.ts"),
      file("plans/adr/0001-fetch-user.md", false),
    ],
    stats: {
      filesTotal: 2,
      filesIndexed: 1,
      filesSkipped: 1,
      durationMs: 0,
    },
    warnings: [],
  };
}

describe("collectRationale (M-075 A1)", () => {
  it("links an ADR that names a pack file and a WHY comment", () => {
    const { hits, edges, nodes } = collectRationale(snapshot());
    expect(nodes.some((n) => n.kind === "adr")).toBe(true);
    expect(hits.some((h) => h.toPath === "src/users/fetchUser.ts")).toBe(true);
    expect(hits.some((h) => h.adrPath === "plans/adr/0001-fetch-user.md")).toBe(
      true,
    );
    expect(hits.some((h) => h.text.startsWith("WHY:"))).toBe(true);
    expect(edges.every((e) => e.kind === "rationale_for")).toBe(true);
    expect(edges.every((e) => e.provenance === "measured")).toBe(true);
  });

  it("shows rationale_for on the knowledge graph", () => {
    const kg = buildKnowledgeGraph(snapshot());
    expect(kg.graph.edges.some((e) => e.kind === "rationale_for")).toBe(true);
    expect(kg.graph.nodes.some((n) => n.kind === "adr")).toBe(true);
  });
});

describe("rationale scan cache (token fix 2)", () => {
  it("re-reads a file only when its content hash changes", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-rationale-"));
    cpSync(FIXTURE, root, { recursive: true });
    const adr = "plans/adr/0001-fetch-user.md";
    const snap = (hash: string): IndexSnapshot => {
      const base = snapshot();
      return {
        ...base,
        rootPath: root,
        files: base.files.map((f) =>
          f.path === adr ? { ...f, contentHash: hash } : f,
        ),
      };
    };
    const linked = (s: IndexSnapshot) =>
      collectRationale(s).hits.some((h) => h.adrPath === adr);
    expect(linked(snap("h1"))).toBe(true);
    writeFileSync(join(root, adr), "# ADR 0001\n\nNo paths here.\n");
    // Same hash: the new snapshot reuses the scan instead of reading again.
    expect(linked(snap("h1"))).toBe(true);
    // A new hash is a new file body.
    expect(linked(snap("h2"))).toBe(false);
  });
});
