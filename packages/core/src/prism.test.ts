import { describe, expect, it } from "vitest";
import { PrismErrorCode } from "@prism/shared";
import { Prism } from "./prism.js";
import { STUB_CAPABILITIES } from "./capabilities.js";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "./version.js";
import type { IndexerPort } from "./ports.js";
import { ok } from "@prism/shared";
import type { IndexSummary } from "@prism/shared";

describe("Prism.create", () => {
  it("exposes version, apiLevel, and analysis capability with default analyzer", () => {
    const client = Prism.create();
    expect(client.version).toBe(PRISM_CORE_VERSION);
    expect(client.apiLevel).toBe(PRISM_API_LEVEL);
    expect(client.capabilities).toEqual({
      ...STUB_CAPABILITIES,
      analysis: true,
    });
  });

  it("lists loaded language plugins via Core", () => {
    const client = Prism.create();
    expect(client.listLanguagePlugins()).toEqual([
      expect.objectContaining({
        id: "noop",
        extensions: [".noop"],
        spiVersion: 1,
      }),
    ]);
  });

  it("can disable default analyzer", () => {
    const client = Prism.create({ disableDefaultAnalyzer: true });
    expect(client.listLanguagePlugins()).toEqual([]);
    expect(client.capabilities.analysis).toBe(false);
  });
});

describe("lifecycle open → analyze → close", () => {
  it("opens an absolute fixture path and no-op analyzes", async () => {
    const client = Prism.create();
    const opened = client.openRepository(process.cwd());
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const ws = opened.value;
    expect(ws.status().open).toBe(true);
    expect(ws.rootPath).toBe(process.cwd());

    const analyzed = await ws.analyze();
    expect(analyzed.ok).toBe(true);
    if (!analyzed.ok) return;
    expect(analyzed.value.stats.filesIndexed).toBe(0);
    expect(analyzed.value.warnings.length).toBeGreaterThan(0);
    expect(ws.status().lastIndexedAt).toBe(analyzed.value.indexedAt);

    ws.close();
    expect(ws.status().open).toBe(false);

    const afterClose = await ws.analyze();
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
    const client = Prism.create();
    const opened = client.openRepository(process.cwd());
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const dna = await opened.value.getDna();
    expect(dna.ok).toBe(false);
    if (dna.ok) return;
    expect(dna.error.code).toBe(PrismErrorCode.UNSUPPORTED);

    opened.value.close();
  });

  it("delegates analyze to injected indexer port when present", async () => {
    const summary: IndexSummary = {
      repoId: "repo:test",
      rootPath: process.cwd(),
      indexedAt: new Date("2026-07-20T00:00:00.000Z").toISOString(),
      stats: {
        filesTotal: 1,
        filesIndexed: 1,
        filesSkipped: 0,
        durationMs: 1,
      },
      warnings: [],
    };
    const indexer: IndexerPort = {
      async indexWorkspace() {
        return ok(summary);
      },
    };

    const client = Prism.create({ ports: { indexer } });
    const opened = client.openRepository(process.cwd());
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const analyzed = await opened.value.analyze();
    expect(analyzed.ok).toBe(true);
    if (!analyzed.ok) return;
    expect(analyzed.value.stats.filesIndexed).toBe(1);
    opened.value.close();
  });
});
