/**
 * Build / cache the compact repo map (P1).
 */

import {
  MAP_DEFAULT_BUDGET,
  buildRepoMap,
  changedPaths,
  mergeMapEntries,
  readMapCache,
  renderRepoMap,
  snapshotKey,
  writeMapCache,
  type MapFileEntry,
} from "@repo-prism/intelligence";
import {
  type GitFileSignal,
  type IndexSnapshot,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
  PrismErrorCode,
} from "@repo-prism/shared";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import type { GraphReads } from "./graph-reads.js";

export type RepoMapResult = {
  readonly text: string;
  readonly snapshotKey: string;
  readonly kept: number;
  readonly total: number;
  readonly truncated: boolean;
  readonly tokenEstimate: number;
  readonly fromCache: boolean;
};

function importEdges(
  workspace: GraphReads,
): Result<{ from: string; to: string }[], PrismError> {
  const graph = workspace.getDependencyGraph();
  if (!graph.ok) return graph;
  const FILE = "file:";
  const edges: { from: string; to: string }[] = [];
  for (const e of graph.value.edges) {
    if (!e.from.startsWith(FILE) || !e.to.startsWith(FILE)) continue;
    edges.push({
      from: e.from.slice(FILE.length),
      to: e.to.slice(FILE.length),
    });
  }
  return ok(edges);
}

function gitRecency(
  signals: readonly GitFileSignal[] | undefined,
): Map<string, number> | undefined {
  if (!signals || signals.length === 0) return undefined;
  const m = new Map<string, number>();
  for (const s of signals) {
    if (typeof s.recency === "number") m.set(s.path, s.recency);
  }
  return m.size > 0 ? m : undefined;
}

export function buildCachedRepoMap(
  workspace: GraphReads,
  opts: {
    readonly scope?: string;
    readonly maxTokens?: number;
    /** Read only when the cached map is stale: git history is slow to read. */
    readonly gitFiles?: () => readonly GitFileSignal[] | undefined;
    /** HEAD sha: git history changes only with a commit, so it keys the map. */
    readonly gitHead?: string;
    readonly refresh?: boolean;
  } = {},
): Result<RepoMapResult, PrismError> {
  const index = workspace.getIndex();
  if (!index.ok) return index;
  const snapshot = index.value;
  const key = snapshotKey(snapshot, opts.gitHead ?? "");
  const maxTokens = opts.maxTokens ?? MAP_DEFAULT_BUDGET;
  const dir = workspacePrismDir(workspace.rootPath);
  const cache = opts.refresh ? undefined : readMapCache(dir);
  if (
    cache &&
    cache.snapshotKey === key &&
    cache.maxTokens === maxTokens &&
    (cache.scope ?? undefined) === (opts.scope ?? undefined)
  ) {
    return ok({
      text: cache.text,
      snapshotKey: key,
      kept: cache.entries.length,
      total: cache.entries.length,
      truncated: false,
      tokenEstimate: Math.ceil(cache.text.length / 4),
      fromCache: true,
    });
  }

  const edges = importEdges(workspace);
  if (!edges.ok) return edges;

  const recency = gitRecency(opts.gitFiles?.());
  const baseInput = {
    snapshot,
    imports: edges.value,
    ...(opts.scope ? { scope: opts.scope } : {}),
    ...(recency ? { gitRecency: recency } : {}),
  };
  let entries: MapFileEntry[];
  if (
    cache &&
    cache.scope === opts.scope &&
    cache.entries.length > 0 &&
    !opts.refresh
  ) {
    const changed = changedPaths(cache.entries, snapshot);
    const fresh = buildRepoMap(baseInput);
    entries = mergeMapEntries(cache.entries, fresh, changed);
  } else {
    entries = buildRepoMap(baseInput);
  }

  const rendered = renderRepoMap(entries, {
    snapshotKey: key,
    maxTokens,
    ...(opts.scope ? { scope: opts.scope } : {}),
  });
  writeMapCache(dir, {
    snapshotKey: key,
    entries,
    text: rendered.text,
    ...(opts.scope ? { scope: opts.scope } : {}),
    maxTokens,
  });
  return ok({
    text: rendered.text,
    snapshotKey: key,
    kept: rendered.kept,
    total: rendered.total,
    truncated: rendered.truncated,
    tokenEstimate: rendered.tokenEstimate,
    fromCache: false,
  });
}

export function requireIndexed(
  snapshot: IndexSnapshot | null,
): Result<IndexSnapshot, PrismError> {
  if (!snapshot) {
    return err(
      prismError(
        PrismErrorCode.INDEX_REQUIRED,
        "No index snapshot yet — call workspace.index() first",
      ),
    );
  }
  return ok(snapshot);
}
