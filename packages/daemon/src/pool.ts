/**
 * Open workspaces, each indexed once and kept fresh by file events
 * (ADR-0063 §4). The pool is the daemon's only state worth having: it is
 * what an MCP process no longer has to build for itself.
 */

import { existsSync, type FSWatcher, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Prism, type PrismWorkspace } from "@repo-prism/core";
import {
  type PrismError,
  PrismErrorCode,
  type Result,
  err,
  ok,
  prismError,
} from "@repo-prism/shared";
import type { DaemonWorkspaceStatus } from "./client.js";

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

export type PoolOptions = {
  readonly debounceMs: number;
  readonly maxWorkspaces: number;
  /** Runs after the first index and after every reindex (hook snapshot, lenses). */
  readonly onIndexed?: (workspace: PrismWorkspace) => Promise<void>;
  readonly openWorkspace?: (root: string) => Result<PrismWorkspace, PrismError>;
  readonly log?: (line: string) => void;
};

type Entry = {
  readonly root: string;
  ready: Promise<Result<PrismWorkspace, PrismError>>;
  workspace?: PrismWorkspace;
  watcher?: FSWatcher;
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

function defaultOpen(root: string): Result<PrismWorkspace, PrismError> {
  return Prism.create().openRepository(root);
}

export function createWorkspacePool(options: PoolOptions): WorkspacePool {
  const open = options.openWorkspace ?? defaultOpen;
  const log = options.log ?? (() => undefined);
  const entries = new Map<string, Entry>();
  let paused = false;

  const route = (entry: Entry, workspace: PrismWorkspace) => {
    return (_event: string, filename: string | Buffer | null): void => {
      if (!filename) return;
      const rel = String(filename).replace(/\\/g, "/");
      if (!rel || isIgnoredPath(rel)) return;
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
        void options.onIndexed?.(workspace).catch(() => undefined);
      },
    });
    if (!started.ok) {
      log(`watch failed for ${entry.root}: ${started.error.message}`);
      return;
    }
    try {
      entry.watcher = watch(
        entry.root,
        { recursive: true, persistent: false },
        route(entry, workspace),
      );
      entry.watcher.on("error", (error) => {
        log(`watcher error for ${entry.root}: ${String(error)}`);
      });
    } catch (error) {
      log(`fs.watch unavailable for ${entry.root}: ${String(error)}`);
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
    await options.onIndexed?.(opened.value).catch(() => undefined);
    startWatching(entry, opened.value);
    return ok(opened.value);
  };

  const closeEntry = (entry: Entry): void => {
    entry.watcher?.close();
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
