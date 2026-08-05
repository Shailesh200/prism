import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Prism } from "./prism.js";

/**
 * M-052: the extension host and the playground each assembled this report
 * themselves from the same Core primitives, and disagreed — the playground
 * stamped `lastRunAt` even when no runner existed, so the UI claimed tests had
 * just run when nothing had. Both now call this one method.
 */
describe("workspace runWorkspaceTests / listWorkspaceTests (M-052)", () => {
  async function emptyWorkspace() {
    const root = await mkdtemp(join(tmpdir(), "prism-core-wstests-"));
    const client = Prism.create();
    const opened = client.openRepository(root);
    if (!opened.ok) throw new Error("openRepository failed");
    return { root, ws: opened.value };
  }

  it("reports no runner rather than a fabricated run", async () => {
    const { root, ws } = await emptyWorkspace();
    // No package.json, no vitest, no jest — nothing can run here.
    await writeFile(join(root, "index.ts"), "export const a = 1;\n", "utf8");

    const result = await ws.runWorkspaceTests();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.results).toEqual([]);
    expect(result.value.summary).toContain("No test runner binary found.");
    // The important part: nothing ran, so nothing claims a run time.
    expect(result.value.lastRunAt).toBeUndefined();
  });

  it("keeps the static report's shape when no runner is present", async () => {
    const { ws } = await emptyWorkspace();

    const base = await ws.getTestingReport();
    const run = await ws.runWorkspaceTests();
    expect(base.ok && run.ok).toBe(true);
    if (!base.ok || !run.ok) return;

    expect(run.value.score).toBe(base.value.score);
    expect(run.value.runners).toEqual(base.value.runners);
    expect(run.value.suites).toEqual(base.value.suites);
  });

  it("lists no tests instead of failing when no runner is present", async () => {
    const { ws } = await emptyWorkspace();

    const result = await ws.listWorkspaceTests();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toEqual([]);
  });

  it("refuses once the workspace is closed", async () => {
    const { ws } = await emptyWorkspace();
    await ws.close();

    const run = await ws.runWorkspaceTests();
    const list = await ws.listWorkspaceTests();
    expect(run.ok).toBe(false);
    expect(list.ok).toBe(false);
  });
});
