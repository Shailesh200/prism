import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IndexedFile, IndexSnapshot } from "@prism/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openIndexCache } from "./db.js";
import { loadCachedFiles, loadCachedSnapshot, saveSnapshot } from "./store.js";

const ROOT = "/repo";

function file(
  path: string,
  contentHash: string | null,
  extra: Partial<IndexedFile> = {},
): IndexedFile {
  return {
    path,
    pluginId: "typescript",
    contentHash,
    status: "analyzed",
    symbols: [],
    imports: [],
    exports: [],
    references: [],
    diagnostics: [],
    ...extra,
  } as IndexedFile;
}

function snapshot(files: readonly IndexedFile[]): IndexSnapshot {
  return {
    repoId: "repo-1",
    rootPath: ROOT,
    indexedAt: "2026-01-01T00:00:00.000Z",
    files: [...files],
    stats: {
      filesTotal: files.length,
      filesIndexed: files.length,
      filesSkipped: 0,
      durationMs: 1,
    },
    warnings: [],
  } as IndexSnapshot;
}

describe("saveSnapshot", () => {
  let dir = "";
  let cache: Awaited<ReturnType<typeof openIndexCache>> | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "prism-store-"));
    cache = await openIndexCache(dir);
  });

  afterEach(async () => {
    if (cache?.ok) cache.value.close();
    await rm(dir, { recursive: true, force: true });
  });

  function db() {
    if (!cache?.ok) throw new Error("cache did not open");
    return cache.value.db;
  }

  it("round-trips a snapshot", () => {
    saveSnapshot(db(), snapshot([file("a.ts", "h1"), file("b.ts", "h2")]));

    const loaded = loadCachedSnapshot(db(), ROOT);
    expect(loaded?.files.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
    expect(loaded?.repoId).toBe("repo-1");
  });

  it("drops files that are gone from the new snapshot", () => {
    saveSnapshot(db(), snapshot([file("a.ts", "h1"), file("b.ts", "h2")]));
    saveSnapshot(db(), snapshot([file("a.ts", "h1")]));

    expect([...loadCachedFiles(db(), ROOT).keys()]).toEqual(["a.ts"]);
  });

  it("updates a file whose content changed", () => {
    saveSnapshot(
      db(),
      snapshot([
        file("a.ts", "h1", {
          exports: [{ name: "before", kind: "function" }],
        } as Partial<IndexedFile>),
      ]),
    );
    saveSnapshot(
      db(),
      snapshot([
        file("a.ts", "h2", {
          exports: [{ name: "after", kind: "function" }],
        } as Partial<IndexedFile>),
      ]),
    );

    const reloaded = loadCachedFiles(db(), ROOT).get("a.ts");
    expect(reloaded?.contentHash).toBe("h2");
    expect(reloaded?.exports.map((e) => e.name)).toEqual(["after"]);
  });

  it("rewrites a file whose status changed without its hash changing", () => {
    saveSnapshot(db(), snapshot([file("a.ts", null)]));
    saveSnapshot(
      db(),
      snapshot([
        file("a.ts", null, { status: "skipped_unsupported", pluginId: null }),
      ]),
    );

    const reloaded = loadCachedFiles(db(), ROOT).get("a.ts");
    expect(reloaded?.status).toBe("skipped_unsupported");
    expect(reloaded?.pluginId).toBeNull();
  });

  it("only writes the rows that changed", () => {
    saveSnapshot(
      db(),
      snapshot([file("a.ts", "h1"), file("b.ts", "h2"), file("c.ts", "h3")]),
    );

    let writes = 0;
    const real = db().prepare.bind(db());
    // Counting statement executions is more direct than inferring from timing:
    // the point of the differential write is that unchanged rows are not
    // touched at all, not merely that they end up with the same value.
    const spy = (sql: string) => {
      const stmt = real(sql);
      if (!sql.includes("INSERT INTO indexed_files")) return stmt;
      const run = stmt.run.bind(stmt);
      return Object.assign(stmt, {
        run: (...args: unknown[]) => {
          writes += 1;
          return run(...(args as never[]));
        },
      });
    };
    Object.assign(db(), { prepare: spy });

    saveSnapshot(
      db(),
      snapshot([
        file("a.ts", "h1"),
        file("b.ts", "changed"),
        file("c.ts", "h3"),
      ]),
    );

    Object.assign(db(), { prepare: real });
    expect(writes).toBe(1);

    const reloaded = loadCachedFiles(db(), ROOT);
    expect(reloaded.get("a.ts")?.contentHash).toBe("h1");
    expect(reloaded.get("b.ts")?.contentHash).toBe("changed");
    expect(reloaded.get("c.ts")?.contentHash).toBe("h3");
  });

  it("keeps roots independent", () => {
    saveSnapshot(db(), snapshot([file("a.ts", "h1")]));
    saveSnapshot(db(), {
      ...snapshot([file("z.ts", "h9")]),
      rootPath: "/other",
    });

    expect([...loadCachedFiles(db(), ROOT).keys()]).toEqual(["a.ts"]);
    expect([...loadCachedFiles(db(), "/other").keys()]).toEqual(["z.ts"]);
  });
});
