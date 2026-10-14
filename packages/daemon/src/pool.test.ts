import { EventEmitter } from "node:events";
import type { FSWatcher } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismWorkspace } from "@repo-prism/core";
import { ok } from "@repo-prism/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspacePool,
  isCheckoutEvent,
  needsPollingFallback,
} from "./pool.js";

type Listener = (event: string, filename: string | null) => void;

/** A workspace that records what the pool asks of it. */
function fakeWorkspace(root: string) {
  const calls = {
    notified: [] as string[],
    reindexed: 0,
  };
  const workspace = {
    rootPath: root,
    index: async () => ok({ indexedAt: new Date().toISOString() }),
    reindex: async () => {
      calls.reindexed += 1;
      return ok({ indexedAt: new Date().toISOString() });
    },
    startWatch: () => ok(undefined),
    notifyWatchPaths: (input: {
      changedPaths?: readonly string[];
      deletedPaths?: readonly string[];
    }) => {
      calls.notified.push(
        ...(input.changedPaths ?? []),
        ...(input.deletedPaths ?? []),
      );
      return ok(undefined);
    },
    getIndexFreshness: () =>
      ok({ status: "fresh", lastIndexedAt: null, pendingDirtyCount: 0 }),
    close: () => undefined,
  } as unknown as PrismWorkspace;
  return { workspace, calls };
}

const dirs: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "prism-pool-"));
  dirs.push(dir);
  return dir;
}

describe("watcher (plan §2.4)", () => {
  it("knows checkout events and the errors that need polling", () => {
    expect(isCheckoutEvent(".git/HEAD")).toBe(true);
    expect(isCheckoutEvent(".git/refs/heads/main")).toBe(true);
    expect(isCheckoutEvent(".git/objects/ab/cd")).toBe(false);
    expect(isCheckoutEvent("src/HEAD")).toBe(false);
    expect(needsPollingFallback({ code: "EMFILE" })).toBe(true);
    expect(needsPollingFallback({ code: "ENOSPC" })).toBe(true);
    expect(needsPollingFallback({ code: "EACCES" })).toBe(false);
  });

  it("batches a branch switch into one reindex and drops the burst", async () => {
    const root = await tempRoot();
    const { workspace, calls } = fakeWorkspace(root);
    let listener: Listener | undefined;
    const pool = createWorkspacePool({
      debounceMs: 10,
      maxWorkspaces: 2,
      checkoutSettleMs: 20,
      openWorkspace: () => ok(workspace),
      watch: ((_root: string, _opts: unknown, cb: Listener) => {
        listener = cb;
        return Object.assign(new EventEmitter(), {
          close: () => undefined,
        }) as unknown as FSWatcher;
      }) as never,
    });
    await pool.get(root);
    await writeFile(join(root, "a.ts"), "x");
    listener?.("change", ".git/HEAD");
    for (let i = 0; i < 50; i += 1) listener?.("change", `src/file${i}.ts`);
    listener?.("change", ".git/refs/heads/feature");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(calls.reindexed).toBe(1);
    expect(calls.notified).toEqual([]);
    // After the batch, edits flow again.
    listener?.("change", "a.ts");
    expect(calls.notified).toEqual(["a.ts"]);
    pool.closeAll();
  });

  it("falls back to polling git when the watcher errors (EMFILE)", async () => {
    const root = await tempRoot();
    const { workspace, calls } = fakeWorkspace(root);
    const watcher = new EventEmitter() as unknown as FSWatcher & {
      close(): void;
    };
    (watcher as { close: () => void }).close = () => undefined;
    let dirty: string[] = [];
    const pool = createWorkspacePool({
      debounceMs: 10,
      maxWorkspaces: 2,
      pollIntervalMs: 15,
      openWorkspace: () => ok(workspace),
      watch: (() => watcher) as never,
      changedPaths: () => dirty,
      log: () => undefined,
    });
    await pool.get(root);
    const error = Object.assign(new Error("too many open files"), {
      code: "EMFILE",
    });
    (watcher as unknown as EventEmitter).emit("error", error);
    await writeFile(join(root, "b.ts"), "x");
    dirty = ["b.ts", "node_modules/x/index.js"];
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls.notified).toContain("b.ts");
    expect(calls.notified).not.toContain("node_modules/x/index.js");
    const seen = calls.notified.filter((p) => p === "b.ts").length;
    // Unchanged on later polls: not notified again.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.notified.filter((p) => p === "b.ts").length).toBe(seen);
    // Reverted: notified once more.
    dirty = [];
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.notified.filter((p) => p === "b.ts").length).toBe(seen + 1);
    pool.closeAll();
  });
});
