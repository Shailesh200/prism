/**
 * Open workspaces, each indexed once and kept fresh by file events
 * (ADR-0063 §4). The pool is the daemon's only state worth having: it is
 * what an MCP process no longer has to build for itself.
 */

import { existsSync, type FSWatcher, statSync, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Prism, readChangedPaths, type PrismWorkspace } from "@repo-prism/core";
import { readGitHead } from "@repo-prism/shared/git-head";
import {
  type PrismError,
  PrismErrorCode,
  type Result,
  err,
  ok,
  prismError,
} from "@repo-prism/shared";
import type { DaemonWorkspaceStatus } from "./client.js";
import { recordEvent } from "@repo-prism/shared/events";

/** Never worth a reindex: build output, dependencies, VCS and Prism's own state. */
const IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".prism",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".moon",
  ".cache",
  ".vite",
]);

export function isIgnoredPath(relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  return parts.some((part) => IGNORED_SEGMENTS.has(part));
}

/**
 * A file event that means the checkout moved (branch switch, reset, pull):
 * `.git/HEAD`, a branch ref or the HEAD reflog. One batched reindex follows
 * and the burst of file events behind it is dropped (plan §2.4).
 */
export function isCheckoutEvent(relativePath: string): boolean {
  const rel = relativePath.replace(/\\/g, "/");
  return (
    rel === ".git/HEAD" ||
    rel === ".git/logs/HEAD" ||
    rel.startsWith(".git/refs/heads/")
  );
}

/** Watcher errors that mean "too many files to watch": switch to polling. */
export function needsPollingFallback(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return (
    code === "EMFILE" ||
    code === "ENOSPC" ||
    code === "ENFILE" ||
    code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM"
  );
}

/** How often the polling fallback asks git what changed. */
export const POLL_INTERVAL_MS = 2_000;
/** Quiet time after a checkout event before the one batched reindex. */
export const CHECKOUT_SETTLE_MS = 300;

export type PoolOptions = {
  readonly debounceMs: number;
  readonly maxWorkspaces: number;
  /** Runs after the first index and after every reindex (hook snapshot, lenses). */
  readonly onIndexed?: (workspace: PrismWorkspace) => Promise<void>;
  readonly openWorkspace?: (root: string) => Result<PrismWorkspace, PrismError>;
  readonly log?: (line: string) => void;
  /** Injectable for tests: `fs.watch` and the git status poll. */
  readonly watch?: typeof watch;
  readonly changedPaths?: (root: string) => readonly string[] | null;
  readonly pollIntervalMs?: number;
  readonly checkoutSettleMs?: number;
};

type Entry = {
  readonly root: string;
  ready: Promise<Result<PrismWorkspace, PrismError>>;
  workspace?: PrismWorkspace;
  watcher?: FSWatcher | undefined;
  /** Set when the watcher failed and git status is polled instead. */
  poller?: ReturnType<typeof setInterval>;
  /** Paths (with mtimes) the last poll saw changed. */
  polled?: Map<string, number>;
  /** Pending batched reindex after a checkout; events are dropped meanwhile. */
  checkout?: ReturnType<typeof setTimeout> | undefined;
  switching: boolean;
  lastUsed: number;
  failed?: string;
  reindexStartedAt: number | null;
  lastReindexMs: number | null;
  /** File events seen while paused; replayed on resume. */
  heldChanged: Set<string>;
  heldDeleted: Set<string>;
};

export type WorkspacePool = {
  get(root: string): Promise<Result<PrismWorkspace, PrismError>>;
  /** Start opening `root` without waiting for it. */
  warm(root: string): void;
  status(): DaemonWorkspaceStatus[];
  setPaused(paused: boolean): void;
  /** Close the least recently used workspace. False when none is left to close. */
  evictOne(): boolean;
  evictIdle(idleMs: number): void;
  closeAll(): void;
};

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return -1;
    throw error;
  }
}

function defaultOpen(root: string): Result<PrismWorkspace, PrismError> {
  return Prism.create().openRepository(root);
}

export function createWorkspacePool(options: PoolOptions): WorkspacePool {
  const open = options.openWorkspace ?? defaultOpen;
  const log = options.log ?? (() => undefined);
  const entries = new Map<string, Entry>();
  let paused = false;

  const watchFn = options.watch ?? watch;
  const changedPathsOf =
    options.changedPaths ??
    ((root: string) => readChangedPaths(root, {})?.paths ?? null);

  const notify = (
    entry: Entry,
    workspace: PrismWorkspace,
    rel: string,
  ): void => {
    const gone = !existsSync(join(entry.root, rel));
    if (paused) {
      (gone ? entry.heldDeleted : entry.heldChanged).add(rel);
      (gone ? entry.heldChanged : entry.heldDeleted).delete(rel);
      return;
    }
    if (entry.reindexStartedAt === null) entry.reindexStartedAt = Date.now();
    workspace.notifyWatchPaths(
      gone ? { deletedPaths: [rel] } : { changedPaths: [rel] },
    );
  };

  /** One full reindex for a checkout, however many files it rewrote. */
  const scheduleCheckout = (entry: Entry, workspace: PrismWorkspace): void => {
    entry.switching = true;
    if (entry.checkout) clearTimeout(entry.checkout);
    entry.checkout = setTimeout(() => {
      entry.checkout = undefined;
      const begun = Date.now();
      void workspace
        .reindex()
        .then(async (result) => {
          if (!result.ok) throw new Error(result.error.message);
          entry.lastReindexMs = Date.now() - begun;
          recordEvent({
            event: "watch.checkout",
            outcome: "ok",
            workspace: entry.root,
            durationMs: entry.lastReindexMs,
          });
          await options.onIndexed?.(workspace);
        })
        .catch((error: unknown) => indexedHookFailed(entry.root, error))
        .finally(() => {
          entry.switching = false;
        });
    }, options.checkoutSettleMs ?? CHECKOUT_SETTLE_MS);
    entry.checkout.unref?.();
  };

  const route = (entry: Entry, workspace: PrismWorkspace) => {
    return (_event: string, filename: string | Buffer | null): void => {
      if (!filename) return;
      const rel = String(filename).replace(/\\/g, "/");
      if (!rel) return;
      if (isCheckoutEvent(rel)) {
        if (!paused) scheduleCheckout(entry, workspace);
        return;
      }
      if (isIgnoredPath(rel) || entry.switching) return;
      notify(entry, workspace, rel);
    };
  };

  /**
   * Watcher fallback (plan §2.4): ask git what changed every 2 s and feed
   * the difference to the index. A change of HEAD is a checkout.
   */
  const startPolling = (
    entry: Entry,
    workspace: PrismWorkspace,
    reason: string,
  ): void => {
    if (entry.poller) return;
    entry.watcher?.close();
    entry.watcher = undefined;
    log(`watching ${entry.root} by polling: ${reason}`);
    recordEvent({
      event: "watch.fallback",
      outcome: "degraded",
      reason,
      workspace: entry.root,
    });
    let head = readGitHead(entry.root)?.sha ?? null;
    entry.polled = new Map();
    const poll = (): void => {
      const now = readGitHead(entry.root)?.sha ?? null;
      if (now !== head) {
        head = now;
        if (!paused) scheduleCheckout(entry, workspace);
        return;
      }
      if (entry.switching) return;
      const paths = changedPathsOf(entry.root);
      if (paths === null) return;
      const next = new Map<string, number>();
      for (const rel of paths) {
        if (isIgnoredPath(rel)) continue;
        const mtime = mtimeOf(join(entry.root, rel));
        next.set(rel, mtime);
        if (entry.polled?.get(rel) !== mtime) notify(entry, workspace, rel);
      }
      // A path that was dirty and is not any more was reverted or committed.
      for (const rel of entry.polled?.keys() ?? []) {
        if (!next.has(rel)) notify(entry, workspace, rel);
      }
      entry.polled = next;
    };
    entry.poller = setInterval(
      poll,
      options.pollIntervalMs ?? POLL_INTERVAL_MS,
    );
    entry.poller.unref?.();
  };

  const indexedHookFailed = (root: string, error: unknown): void => {
    const reason = error instanceof Error ? error.message : String(error);
    log(`after-index work failed for ${root}: ${reason}`);
    recordEvent({
      event: "daemon.on_indexed",
      outcome: "degraded",
      reason,
      workspace: root,
    });
  };

  const startWatching = (entry: Entry, workspace: PrismWorkspace): void => {
    const started = workspace.startWatch({
      debounceMs: options.debounceMs,
      onChange: (freshness) => {
        if (freshness.status !== "fresh") return;
        if (entry.reindexStartedAt !== null) {
          entry.lastReindexMs = Date.now() - entry.reindexStartedAt;
          entry.reindexStartedAt = null;
        }
        void options
          .onIndexed?.(workspace)
          .catch((error: unknown) => indexedHookFailed(entry.root, error));
      },
    });
    if (!started.ok) {
      log(`watch failed for ${entry.root}: ${started.error.message}`);
      return;
    }
    try {
      entry.watcher = watchFn(
        entry.root,
        { recursive: true, persistent: false },
        route(entry, workspace),
      );
      entry.watcher.on("error", (error) => {
        log(`watcher error for ${entry.root}: ${String(error)}`);
        startPolling(entry, workspace, `watcher error: ${String(error)}`);
      });
    } catch (error) {
      if (!needsPollingFallback(error)) {
        log(`fs.watch unavailable for ${entry.root}: ${String(error)}`);
      }
      startPolling(entry, workspace, `fs.watch unavailable: ${String(error)}`);
    }
  };

  const openEntry = async (
    entry: Entry,
  ): Promise<Result<PrismWorkspace, PrismError>> => {
    try {
      const info = await stat(entry.root);
      if (!info.isDirectory()) throw new Error("not a directory");
    } catch {
      return err(
        prismError(
          PrismErrorCode.INVALID_PATH,
          `Workspace path is not a readable directory: ${entry.root}`,
        ),
      );
    }
    const opened = open(entry.root);
    if (!opened.ok) return opened;
    const started = Date.now();
    const indexed = await opened.value.index();
    if (!indexed.ok) {
      opened.value.close();
      return err(indexed.error);
    }
    log(`indexed ${entry.root} in ${Date.now() - started}ms`);
    entry.workspace = opened.value;
    await options
      .onIndexed?.(opened.value)
      .catch((error: unknown) => indexedHookFailed(entry.root, error));
    startWatching(entry, opened.value);
    return ok(opened.value);
  };

  const closeEntry = (entry: Entry): void => {
    entry.watcher?.close();
    if (entry.poller) clearInterval(entry.poller);
    if (entry.checkout) clearTimeout(entry.checkout);
    entry.workspace?.close();
    entries.delete(entry.root);
    log(`closed ${entry.root}`);
  };

  const leastRecent = (): Entry | undefined =>
    [...entries.values()]
      .filter((entry) => entry.workspace)
      .sort((a, b) => a.lastUsed - b.lastUsed)[0];

  const entryFor = (rawRoot: string): Entry => {
    const root = resolve(rawRoot);
    const existing = entries.get(root);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing;
    }
    while (entries.size >= options.maxWorkspaces) {
      const victim = leastRecent();
      if (!victim) break;
      closeEntry(victim);
    }
    const entry: Entry = {
      root,
      ready: Promise.resolve().then(async () => {
        const result = await openEntry(entry);
        if (!result.ok) {
          // A failed open is not cached: the next request tries again.
          entry.failed = result.error.message;
          entries.delete(root);
        }
        return result;
      }),
      lastUsed: Date.now(),
      reindexStartedAt: null,
      lastReindexMs: null,
      switching: false,
      heldChanged: new Set(),
      heldDeleted: new Set(),
    };
    entries.set(root, entry);
    return entry;
  };

  return {
    get(root) {
      return entryFor(root).ready;
    },
    warm(root) {
      void entryFor(root).ready;
    },
    status() {
      return [...entries.values()].map((entry) => {
        const freshness = entry.workspace?.getIndexFreshness();
        const fresh = freshness?.ok ? freshness.value : undefined;
        const state: DaemonWorkspaceStatus["state"] = entry.failed
          ? "failed"
          : !entry.workspace
            ? "indexing"
            : paused
              ? "paused"
              : (fresh?.status ?? "stale");
        return {
          root: entry.root,
          state,
          lastIndexedAt: fresh?.lastIndexedAt ?? null,
          pendingDirtyCount:
            (fresh?.pendingDirtyCount ?? 0) +
            entry.heldChanged.size +
            entry.heldDeleted.size,
          lastUsedAt: new Date(entry.lastUsed).toISOString(),
          lastReindexMs: entry.lastReindexMs,
          ...(entry.failed ? { error: entry.failed } : {}),
        };
      });
    },
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      log(next ? "paused reindexing" : "resumed reindexing");
      if (next) return;
      for (const entry of entries.values()) {
        const workspace = entry.workspace;
        if (!workspace) continue;
        const changedPaths = [...entry.heldChanged];
        const deletedPaths = [...entry.heldDeleted];
        entry.heldChanged.clear();
        entry.heldDeleted.clear();
        if (changedPaths.length + deletedPaths.length > 0) {
          workspace.notifyWatchPaths({ changedPaths, deletedPaths });
        }
      }
    },
    evictOne() {
      const victim = leastRecent();
      if (!victim) return false;
      closeEntry(victim);
      return true;
    },
    evictIdle(idleMs) {
      const cutoff = Date.now() - idleMs;
      for (const entry of entries.values()) {
        if (entry.workspace && entry.lastUsed < cutoff) closeEntry(entry);
      }
    },
    closeAll() {
      for (const entry of entries.values()) closeEntry(entry);
    },
  };
}
