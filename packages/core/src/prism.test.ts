import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PrismErrorCode, ok, type IndexSnapshot } from "@prism/shared";
import { Prism } from "./prism.js";
import { STUB_CAPABILITIES } from "./capabilities.js";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "./version.js";
import type { IndexerPort } from "./ports.js";

const miniFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "indexer",
  "fixtures",
  "m007-mini",
);

describe("Prism.create", () => {
  it("exposes version, apiLevel, analysis + indexing with defaults", () => {
    const client = Prism.create();
    expect(client.version).toBe(PRISM_CORE_VERSION);
    expect(client.apiLevel).toBe(PRISM_API_LEVEL);
    expect(client.capabilities).toEqual({
      ...STUB_CAPABILITIES,
      analysis: true,
      indexing: true,
    });
  });

  it("lists loaded language plugins via Core", () => {
    const client = Prism.create();
    const ids = client.listLanguagePlugins().map((p) => p.id);
    expect(ids).toEqual(["typescript", "noop"]);
  });

  it("can disable default analyzer", () => {
    const client = Prism.create({ disableDefaultAnalyzer: true });
    expect(client.listLanguagePlugins()).toEqual([]);
    expect(client.capabilities.analysis).toBe(false);
  });

  it("can disable default indexer", () => {
    const client = Prism.create({ disableDefaultIndexer: true });
    expect(client.capabilities.indexing).toBe(false);
  });

  it("lists loaded stack detectors via Core", () => {
    const client = Prism.create();
    expect(client.listStackDetectors().map((d) => d.id)).toEqual([
      "unknown",
      "nodejs-manifest",
    ]);
  });

  it("returns a stub stack profile for a workspace with package.json", async () => {
    const client = Prism.create();
    const profile = await client.getStackProfile(process.cwd());
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.domains).toContain("tooling");
  });

  it("can disable default stack detectors", async () => {
    const client = Prism.create({ disableDefaultStack: true });
    expect(client.listStackDetectors()).toEqual([]);
    const profile = await client.getStackProfile(process.cwd());
    expect(profile.ok).toBe(false);
    if (profile.ok) return;
    expect(profile.error.code).toBe(PrismErrorCode.UNSUPPORTED);
  });
});

describe("lifecycle open → index → getIndex → close", () => {
  it("indexes the mini fixture and caches the snapshot", async () => {
    const client = Prism.create();
    const opened = client.openRepository(miniFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const ws = opened.value;
    const before = ws.getIndex();
    expect(before.ok).toBe(false);
    if (before.ok) return;
    expect(before.error.code).toBe(PrismErrorCode.INDEX_REQUIRED);

    const indexed = await ws.index({ concurrency: 2 });
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;
    expect(indexed.value.files.some((f) => f.path === "src/a.ts")).toBe(true);
    expect(ws.status().lastIndexedAt).toBe(indexed.value.indexedAt);

    const cached = ws.getIndex();
    expect(cached.ok).toBe(true);
    if (!cached.ok) return;
    expect(cached.value.indexedAt).toBe(indexed.value.indexedAt);

    const analyzed = await ws.analyze({ concurrency: 2 });
    expect(analyzed.ok).toBe(true);
    if (!analyzed.ok) return;
    expect(analyzed.value.stats.filesIndexed).toBe(
      indexed.value.stats.filesIndexed,
    );

    ws.close();
    const afterClose = await ws.index();
    expect(afterClose.ok).toBe(false);
    if (afterClose.ok) return;
    expect(afterClose.error.code).toBe(PrismErrorCode.WORKSPACE_NOT_OPEN);
  });

  it("rejects empty and relative paths", () => {
    const client = Prism.create();
    expect(client.openRepository("").ok).toBe(false);
    expect(client.openRepository("relative/path").ok).toBe(false);

    const bad = client.openRepository("../oops");
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe(PrismErrorCode.INVALID_PATH);
  });

  it("returns UNSUPPORTED for intelligence stubs while open", async () => {
    const client = Prism.create({ disableDefaultIndexer: true });
    const opened = client.openRepository(process.cwd());
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const dna = await opened.value.getDna();
    expect(dna.ok).toBe(false);
    if (dna.ok) return;
    expect(dna.error.code).toBe(PrismErrorCode.UNSUPPORTED);

    opened.value.close();
  });

  it("delegates index to injected indexer port when present", async () => {
    const snapshot: IndexSnapshot = {
      repoId: "repo:test",
      rootPath: process.cwd(),
      indexedAt: new Date("2026-07-20T00:00:00.000Z").toISOString(),
      files: [],
      stats: {
        filesTotal: 1,
        filesIndexed: 1,
        filesSkipped: 0,
        durationMs: 1,
      },
      warnings: [],
    };
    const indexer: IndexerPort = {
      id: "test-indexer",
      async indexWorkspace() {
        return ok(snapshot);
      },
    };

    const client = Prism.create({ ports: { indexer } });
    const opened = client.openRepository(process.cwd());
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const indexed = await opened.value.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;
    expect(indexed.value.stats.filesIndexed).toBe(1);

    const analyzed = await opened.value.analyze();
    expect(analyzed.ok).toBe(true);
    if (!analyzed.ok) return;
    expect(analyzed.value.stats.filesIndexed).toBe(1);
    opened.value.close();
  });
});
