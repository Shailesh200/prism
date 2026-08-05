import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
    expect(recovered.value.schemaVersion).toBe(3);
    recovered.value.close();
  });

  it("rebuilds after damage inside an otherwise-valid database file", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "prism-cache-torn-"));
    const cacheDbPath = join(cacheDir, "index.sqlite");

    const first = await runIndexJob(fixtureRoot, {
      concurrency: 2,
      cacheDbPath,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.cache?.status).toBe("miss");

    // Keep the SQLite header intact and overwrite content pages, the shape a
    // truncated write leaves behind. The header check cannot see this; the
    // per-open corruption check has to.
    const bytes = await readFile(cacheDbPath);
    const pageSize = bytes.readUInt16BE(16) || 4096;
    expect(bytes.byteLength).toBeGreaterThan(pageSize * 2);
    bytes.fill(0xab, pageSize, bytes.byteLength);
    await writeFile(cacheDbPath, bytes);

    const after = await runIndexJob(fixtureRoot, {
      concurrency: 2,
      cacheDbPath,
    });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.cache?.status).toBe("miss");
    expect(after.value.files.map((f) => f.path)).toEqual(
      first.value.files.map((f) => f.path),
    );
  });
});
