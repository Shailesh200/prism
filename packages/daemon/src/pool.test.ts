import { EventEmitter } from "node:events";
import type { FSWatcher } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismWorkspace } from "@repo-prism/core";
import { ok } from "@repo-prism/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_INCREMENTAL_MAX,
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

describe("one entry per repository", () => {
  it("opens a repository once when it is reached through a symlink", async () => {
    const root = await tempRoot();
    const link = `${root}-link`;
    await symlink(root, link);
    dirs.push(link);
    const opened: string[] = [];
    const pool = createWorkspacePool({
      debounceMs: 10,
      maxWorkspaces: 4,
      openWorkspace: (path: string) => {
        opened.push(path);
        return ok(fakeWorkspace(path).workspace);
      },
      watch: (() =>
        Object.assign(new EventEmitter(), {
          close: () => undefined,
        })) as never,
      log: () => undefined,
    });
    await pool.get(root);
    await pool.get(link);
    expect(opened).toHaveLength(1);
    expect(pool.status()).toHaveLength(1);
    pool.closeAll();
  });
});

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
    // Wait on the outcome, not a fixed sleep (plan P22): load only delays it.
    await vi.waitFor(() => expect(calls.reindexed).toBe(1));
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
    await vi.waitFor(() => expect(calls.notified).toContain("b.ts"));
    expect(calls.notified).not.toContain("node_modules/x/index.js");
    const seen = calls.notified.filter((p) => p === "b.ts").length;
    // Unchanged on later polls: not notified again.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.notified.filter((p) => p === "b.ts").length).toBe(seen);
    // Reverted: notified once more.
    dirty = [];
    await vi.waitFor(() =>
      expect(calls.notified.filter((p) => p === "b.ts").length).toBe(seen + 1),
    );
    pool.closeAll();
  });
});

describe("checkout is incremental (token fix 2)", () => {
  const SHA1 = "1".repeat(40);
  const SHA2 = "2".repeat(40);

  async function gitRoot(): Promise<string> {
    const root = await tempRoot();
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".git", "HEAD"), `${SHA1}\n`);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "x");
    return root;
  }

  function poolFor(
    workspace: PrismWorkspace,
    diff: (root: string, from: string, to: string) => Promise<string[] | null>,
  ) {
    let listener: Listener | undefined;
    const pool = createWorkspacePool({
      debounceMs: 10,
      maxWorkspaces: 2,
      checkoutSettleMs: 20,
      openWorkspace: () => ok(workspace),
      changedPaths: () => [],
      diffCommits: diff,
      log: () => undefined,
      watch: ((_root: string, _opts: unknown, cb: Listener) => {
        listener = cb;
        return Object.assign(new EventEmitter(), {
          close: () => undefined,
        }) as unknown as FSWatcher;
      }) as never,
    });
    return { pool, fire: (name: string) => listener?.("change", name) };
  }

  it("sends the files that differ between the two commits through the watch path", async () => {
    const root = await gitRoot();
    const { workspace, calls } = fakeWorkspace(root);
    const asked: string[][] = [];
    const { pool, fire } = poolFor(workspace, async (_r, from, to) => {
      asked.push([from, to]);
      return ["src/a.ts", "src/gone.ts"];
    });
    await pool.get(root);
    // An edit the checkout may have reverted: not in the diff, not dirty now.
    fire("src/edited.ts");
    await writeFile(join(root, ".git", "HEAD"), `${SHA2}\n`);
    fire(".git/HEAD");
    await vi.waitFor(() => expect(calls.notified).toContain("src/gone.ts"));
    expect(asked).toEqual([[SHA1, SHA2]]);
    expect(calls.reindexed).toBe(0);
    expect(calls.notified).toContain("src/a.ts");
    expect(calls.notified.filter((p) => p === "src/edited.ts")).toHaveLength(2);
    pool.closeAll();
  });

  it("a move too large to diff is one full reindex at a time", async () => {
    const root = await gitRoot();
    const { workspace, calls } = fakeWorkspace(root);
    let running = 0;
    let most = 0;
    (workspace as { reindex: () => Promise<unknown> }).reindex = async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 60));
      running -= 1;
      calls.reindexed += 1;
      return ok({ indexedAt: new Date().toISOString() });
    };
    const many = Array.from(
      { length: CHECKOUT_INCREMENTAL_MAX + 1 },
      (_, i) => `src/f${i}.ts`,
    );
    const { pool, fire } = poolFor(workspace, async () => many);
    await pool.get(root);
    await writeFile(join(root, ".git", "HEAD"), `${SHA2}\n`);
    fire(".git/HEAD");
    await vi.waitFor(() => expect(running).toBe(1));
    await writeFile(join(root, ".git", "HEAD"), `${SHA1}\n`);
    fire(".git/HEAD");
    await vi.waitFor(() => expect(calls.reindexed).toBe(2), { timeout: 3_000 });
    expect(most).toBe(1);
    expect(calls.notified).toEqual([]);
    pool.closeAll();
  });
});
