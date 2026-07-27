# ADR-0026: Incremental watch invalidation unit

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-27 |
| Milestone | M-048 (supersedes M-033 for GA watch) |

## Context

Prism already reuses per-file analysis via content-hash SQLite cache on full
`indexWorkspace` runs. Graphs are rebuilt lazily from `IndexSnapshot` on read.
What was missing is watch orchestration and a dirty-set so inventory need not
always walk the entire tree.

## Decision

1. **Invalidation unit** = repo-relative file path + content hash (ADR-0006).
2. **Watch** lives in Core (`startWatch` / `stopWatch` / `getIndexFreshness`).
   Extension (or any surface) may also forward FS events into
   `notifyWatchPaths` when the host owns the watcher (VS Code
   `FileSystemWatcher`).
3. **Dirty reindex** accepts `changedPaths` / `deletedPaths`. Indexer merges
   those into inventory (rehash only those paths + remove deletes) when provided;
   otherwise falls back to full inventory walk.
4. **Graphs are not patched.** Replacing `lastSnapshot` is sufficient; getters
   rebuild DTOs. True graph-engine patch deferred to M-035 if profiling requires it.

## Consequences

- Correctness matches full reindex for touched files; warm cache keeps analyze cheap.
- Status bar can show `stale` / `indexing` / `fresh` from `getIndexFreshness`.
- Large monorepos still benefit when only a few files change.
