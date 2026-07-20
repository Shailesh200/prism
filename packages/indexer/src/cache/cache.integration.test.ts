import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runIndexJob } from "../index-job.js";
import { openIndexCache } from "./db.js";
import { indexSqlitePath } from "./paths.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "m007-mini",
);

describe("SQLite index cache", () => {
  it("second index of an unchanged fixture is a full cache-hit", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "prism-cache-hit-"));
    const cacheDbPath = join(cacheDir, "index.sqlite");

    const first = await runIndexJob(fixtureRoot, {
      concurrency: 2,
      cacheDbPath,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.cache?.status).toBe("miss");
    expect(first.value.cache?.filesAnalyzed).toBeGreaterThan(0);

    const second = await runIndexJob(fixtureRoot, {
      concurrency: 2,
      cacheDbPath,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.cache?.status).toBe("hit");
    expect(second.value.cache?.filesAnalyzed).toBe(0);
    expect(second.value.cache?.filesReused).toBe(first.value.stats.filesTotal);
    expect(second.value.files.map((f) => f.path)).toEqual(
      first.value.files.map((f) => f.path),
    );
    expect(second.value.warnings.some((w) => w.startsWith("cache-hit:"))).toBe(
      true,
    );
  });

  it("rebuilds after a corrupt database file", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-corrupt-"));
    await writeFile(join(root, "package.json"), '{"name":"c"}\n', "utf8");

    const openedOnce = await openIndexCache(root);
    expect(openedOnce.ok).toBe(true);
    if (!openedOnce.ok) return;
    openedOnce.value.close();

    const dbPath = indexSqlitePath(root);
    await writeFile(dbPath, "NOT A SQLITE DATABASE", "utf8");

    const recovered = await openIndexCache(root);
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.value.schemaVersion).toBe(2);
    recovered.value.close();
  });
});
