import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runIndexJob } from "../index-job.js";
import { openIndexCache } from "./db.js";
import { loadCachedFiles } from "./store.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "m007-mini",
);

/**
 * Two Prism surfaces on one repository is the normal case, not an exotic one:
 * the extension indexes while the CLI runs in a terminal, or an MCP agent and a
 * webview share a checkout. They share one SQLite file, so the question is
 * whether concurrent writers corrupt it (M-035 Phase 4.2).
 */
describe("concurrent workspaces on one cache", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
    );
  });

  async function cacheDir() {
    const dir = await mkdtemp(join(tmpdir(), "prism-concurrent-"));
    dirs.push(dir);
    return join(dir, "index.sqlite");
  }

  it("survives simultaneous indexes of the same repository", async () => {
    const cacheDbPath = await cacheDir();

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        runIndexJob(fixtureRoot, { concurrency: 2, cacheDbPath }),
      ),
    );

    for (const result of results) {
      expect(result.ok).toBe(true);
    }

    // Every writer must agree on the file set. A torn write would show up as a
    // short or duplicated row set rather than as a thrown error.
    const paths = results.map((r) =>
      r.ok ? r.value.files.map((f) => f.path).join("|") : "failed",
    );
    expect(new Set(paths).size).toBe(1);

    const opened = await openIndexCache(fixtureRoot, { dbPath: cacheDbPath });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const cached = loadCachedFiles(opened.value.db, fixtureRoot);
    const first = results[0];
    expect(cached.size).toBe(first?.ok ? first.value.files.length : -1);

    const integrity = opened.value.db.prepare("PRAGMA quick_check").get() as {
      quick_check: string;
    };
    expect(integrity.quick_check).toBe("ok");
    opened.value.close();
  });

  it("leaves a usable cache for a later reader", async () => {
    const cacheDbPath = await cacheDir();

    await Promise.all(
      Array.from({ length: 3 }, () =>
        runIndexJob(fixtureRoot, { concurrency: 2, cacheDbPath }),
      ),
    );

    // The point of surviving concurrent writes is that the next index is still
    // a cache hit. A cache that is intact but unusable has cost, not value.
    const after = await runIndexJob(fixtureRoot, {
      concurrency: 2,
      cacheDbPath,
    });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.cache?.status).toBe("hit");
    expect(after.value.cache?.filesAnalyzed).toBe(0);
  });
});
