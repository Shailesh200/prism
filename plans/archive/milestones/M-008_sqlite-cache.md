# M-008 — Local Persistence (SQLite Cache)

| Field | Value |
|---|---|
| Branch | `milestone/M-008-sqlite-cache` |
| Status | Verified |
| Depends on | M-007 |
| Unlocks | M-009, M-033 |
| Packages | `@repo-prism/indexer` (or `@repo-prism/core` storage module) |

## Goal

Persist index metadata and invalidation hashes in a **local SQLite** database under a Prism cache directory (workspace-local or user cache — ADR).

## In Scope

- Schema versioning + migrations
- Store file hashes, symbol summaries, diagnostics, index meta
- Load path: reuse cache when hashes match
- ADR: cache location & privacy (never upload)
- Corrupt DB recovery (rebuild)

## Out of Scope

- Full graph persistence format finalization (may store blobs; graph engine owns logical model in M-009)
- Cloud sync

## Definition of Done

- [x] Second index of unchanged fixture is cache-hit (asserted in test)
- [x] Migration from v1→v2 smoke test
- [x] Cache path documented
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration (cache hit/miss) · Build · Manual inspect DB with sqlite3 CLI
