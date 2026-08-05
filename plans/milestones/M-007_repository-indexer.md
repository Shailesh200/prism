# M-007 — Repository Indexer v1

| Field | Value |
|---|---|
| Branch | `milestone/M-007-repository-indexer` |
| Status | Verified |
| Depends on | M-006 |
| Unlocks | M-008 |
| Packages | `@repo-prism/indexer`, `@repo-prism/core` |

## Goal

Orchestrate a full-repository index job: inventory → language detect → parse → normalized `IndexSnapshot` consumed by graph builders.

## In Scope

- `IndexJob` with progress events
- Parallelism controls (concurrency limit)
- `IndexSnapshot` schema in `@repo-prism/shared`
- Core method: `workspace.index()` / `getIndex()`
- Cancellation token support

## Out of Scope

- SQLite persistence (M-008)
- Watch mode (M-033)
- Feature detection

## Definition of Done

- [x] Indexing fixture repo produces stable snapshot (golden)
- [x] Progress events tested
- [x] Failed files do not fail entire job
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual timing note on fixture
