import { describe, expect, it } from "vitest";
import {
  PrismErrorCode,
  err,
  ok,
  prismError,
  type IndexSnapshot,
  type PrismError,
  type Result,
} from "@prism/shared";
import { Prism } from "./prism.js";
import type { IndexerPort } from "./ports.js";
import type { IndexFreshness, PrismWorkspace } from "./workspace.js";

type IndexCall = {
  readonly changedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
};

const snapshotAt = (at: string): IndexSnapshot => ({
  repoId: "repo:test",
  rootPath: process.cwd(),
  indexedAt: at,
  files: [],
  stats: { filesTotal: 0, filesIndexed: 0, filesSkipped: 0, durationMs: 1 },
  warnings: [],
});

/**
 * Indexer whose outcome each call can be scripted, so the watch loop can be
 * driven through failure and recovery deterministically.
 */
function createScriptedIndexer(): {
  port: IndexerPort;
  calls: IndexCall[];
  failNext(message: string): void;
  throwNext(message: string): void;
} {
  const calls: IndexCall[] = [];
  let failWith: string | null = null;
  let throwWith: string | null = null;
  let tick = 0;

  const port: IndexerPort = {
    id: "scripted-indexer",
    async indexWorkspace(
      _root,
      options,
    ): Promise<Result<IndexSnapshot, PrismError>> {
      calls.push({
        changedPaths: [...(options?.changedPaths ?? [])],
        deletedPaths: [...(options?.deletedPaths ?? [])],
      });
      if (throwWith !== null) {
        const message = throwWith;
        throwWith = null;
        throw new Error(message);
      }
      if (failWith !== null) {
        const message = failWith;
        failWith = null;
        return err(prismError(PrismErrorCode.INDEX_FAILED, message));
      }
      tick += 1;
      return ok(snapshotAt(new Date(1_000_000 + tick * 1000).toISOString()));
    },
  };

  return {
    port,
    calls,
    failNext(message) {
      failWith = message;
    },
    throwNext(message) {
      throwWith = message;
    },
  };
}

function openWatchedWorkspace(indexer: IndexerPort): PrismWorkspace {
  const client = Prism.create({ ports: { indexer } });
  const opened = client.openRepository(process.cwd());
  if (!opened.ok) throw new Error("failed to open workspace");
  return opened.value;
}

function freshness(ws: PrismWorkspace): IndexFreshness {
  const result = ws.getIndexFreshness();
  if (!result.ok) throw new Error("freshness unavailable");
  return result.value;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Real timers rather than fake ones: `runIndex` performs genuine filesystem and
 * SQLite work, which does not settle when the clock is mocked.
 */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error("waitFor timed out");
}

const DEBOUNCE_MS = 20;

const settled = (ws: PrismWorkspace): boolean =>
  freshness(ws).status !== "indexing";

describe("startWatch / notifyWatchPaths (M-048, hardened in M-051)", () => {
  it("reindexes dirty paths and clears them on success", async () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    expect(ws.startWatch({ debounceMs: DEBOUNCE_MS }).ok).toBe(true);
    expect(ws.notifyWatchPaths({ changedPaths: ["src/a.ts"] }).ok).toBe(true);

    const dirty = freshness(ws);
    expect(dirty.status).toBe("stale");
    expect(dirty.dirtyPaths).toEqual(["src/a.ts"]);

    await waitFor(() => indexer.calls.length === 1);
    await waitFor(() => settled(ws));

    expect(indexer.calls[0]?.changedPaths).toEqual(["src/a.ts"]);

    const after = freshness(ws);
    expect(after.status).toBe("fresh");
    expect(after.pendingDirtyCount).toBe(0);
    expect(after.dirtyPaths).toEqual([]);
    expect(after.lastError).toBeUndefined();

    ws.stopWatch();
    ws.close();
  });

  // The regression this milestone exists for: dirty paths were cleared before
  // the reindex ran, so a failure lost them permanently and the index reported
  // fresh while sitting behind disk.
  it("retains dirty paths when the reindex fails", async () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    ws.startWatch({ debounceMs: DEBOUNCE_MS });
    indexer.failNext("disk exploded");
    ws.notifyWatchPaths({
      changedPaths: ["src/a.ts", "src/b.ts"],
      deletedPaths: ["src/gone.ts"],
    });

    await waitFor(() => indexer.calls.length === 1);
    await waitFor(() => settled(ws));

    const after = freshness(ws);
    expect(after.status).toBe("stale");
    expect(after.dirtyPaths).toEqual(["src/a.ts", "src/b.ts", "src/gone.ts"]);
    expect(after.pendingDirtyCount).toBe(3);
    expect(after.lastError).toBe("disk exploded");

    ws.stopWatch();
    ws.close();
  });

  it("retains dirty paths when the reindex throws", async () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    ws.startWatch({ debounceMs: DEBOUNCE_MS });
    indexer.throwNext("unexpected boom");
    ws.notifyWatchPaths({ changedPaths: ["src/a.ts"] });

    await waitFor(() => indexer.calls.length === 1);
    await waitFor(() => settled(ws));

    const after = freshness(ws);
    expect(after.status).toBe("stale");
    expect(after.dirtyPaths).toEqual(["src/a.ts"]);
    expect(after.lastError).toBe("unexpected boom");

    ws.stopWatch();
    ws.close();
  });

  it("retries after a failure and recovers", async () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    ws.startWatch({ debounceMs: DEBOUNCE_MS });
    indexer.failNext("transient");
    ws.notifyWatchPaths({ changedPaths: ["src/a.ts"] });

    await waitFor(() => indexer.calls.length === 1);
    await waitFor(() => freshness(ws).lastError === "transient");

    // First retry is scheduled with the 2s backoff floor.
    await waitFor(() => indexer.calls.length >= 2);
    await waitFor(() => settled(ws));

    expect(indexer.calls[1]?.changedPaths).toEqual(["src/a.ts"]);

    const after = freshness(ws);
    expect(after.status).toBe("fresh");
    expect(after.pendingDirtyCount).toBe(0);
    expect(after.lastError).toBeUndefined();

    ws.stopWatch();
    ws.close();
  });

  it("coalesces rapid changes into a single reindex", async () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    ws.startWatch({ debounceMs: 200 });
    ws.notifyWatchPaths({ changedPaths: ["src/a.ts"] });
    await sleep(20);
    ws.notifyWatchPaths({ changedPaths: ["src/b.ts"] });
    await sleep(20);
    ws.notifyWatchPaths({ changedPaths: ["src/c.ts"] });

    await waitFor(() => indexer.calls.length === 1);
    await waitFor(() => settled(ws));

    expect(indexer.calls).toHaveLength(1);
    expect(indexer.calls[0]?.changedPaths).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);

    ws.stopWatch();
    ws.close();
  });

  it("moves a path between changed and deleted rather than duplicating it", async () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    ws.startWatch({ debounceMs: 200 });
    ws.notifyWatchPaths({ changedPaths: ["src/a.ts"] });
    ws.notifyWatchPaths({ deletedPaths: ["src/a.ts"] });

    expect(freshness(ws).dirtyPaths).toEqual(["src/a.ts"]);

    await waitFor(() => indexer.calls.length === 1);
    await waitFor(() => settled(ws));

    expect(indexer.calls[0]?.changedPaths).toEqual([]);
    expect(indexer.calls[0]?.deletedPaths).toEqual(["src/a.ts"]);

    ws.stopWatch();
    ws.close();
  });

  it("normalises separators and leading ./ in notified paths", () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    ws.startWatch({ debounceMs: 5000 });
    ws.notifyWatchPaths({ changedPaths: ["src\\win.ts", "./src/dot.ts", ""] });

    expect(freshness(ws).dirtyPaths).toEqual(["src/dot.ts", "src/win.ts"]);

    ws.stopWatch();
    ws.close();
  });

  it("rejects notifyWatchPaths before startWatch", () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    const result = ws.notifyWatchPaths({ changedPaths: ["src/a.ts"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(PrismErrorCode.UNSUPPORTED);

    ws.close();
  });

  it("emits freshness transitions to the onChange subscriber", async () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);
    const seen: IndexFreshness["status"][] = [];

    ws.startWatch({
      debounceMs: DEBOUNCE_MS,
      onChange: (next) => seen.push(next.status),
    });
    ws.notifyWatchPaths({ changedPaths: ["src/a.ts"] });

    await waitFor(() => seen[seen.length - 1] === "fresh");

    expect(seen).toContain("stale");
    expect(seen).toContain("indexing");

    ws.stopWatch();
    ws.close();
  });

  it("stops flushing after stopWatch", async () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    ws.startWatch({ debounceMs: 50 });
    ws.notifyWatchPaths({ changedPaths: ["src/a.ts"] });
    expect(ws.stopWatch().ok).toBe(true);

    await sleep(200);

    expect(indexer.calls).toHaveLength(0);
    expect(freshness(ws).watching).toBe(false);

    ws.close();
  });

  it("clears the previous error when watching restarts", async () => {
    const indexer = createScriptedIndexer();
    const ws = openWatchedWorkspace(indexer.port);

    ws.startWatch({ debounceMs: DEBOUNCE_MS });
    indexer.failNext("nope");
    ws.notifyWatchPaths({ changedPaths: ["src/a.ts"] });

    await waitFor(() => freshness(ws).lastError === "nope");

    ws.stopWatch();
    ws.startWatch({ debounceMs: DEBOUNCE_MS });

    expect(freshness(ws).lastError).toBeUndefined();

    ws.stopWatch();
    ws.close();
  });
});
