# M-007 — Repository Indexer v1

| Field | Value |
|---|---|
| Branch | `milestone/M-007-repository-indexer` |
| Status | Not Started |
| Depends on | M-006 |
| Unlocks | M-008 |
| Packages | `@prism/indexer`, `@prism/core` |

## Goal

Orchestrate a full-repository index job: inventory → language detect → parse → normalized `IndexSnapshot` consumed by graph builders.

## In Scope

- `IndexJob` with progress events
- Parallelism controls (concurrency limit)
- `IndexSnapshot` schema in `@prism/shared`
- Core method: `workspace.index()` / `getIndex()`
- Cancellation token support

## Out of Scope

- SQLite persistence (M-008)
- Watch mode (M-033)
- Feature detection

## Definition of Done

- [ ] Indexing fixture repo produces stable snapshot (golden)
- [ ] Progress events tested
- [ ] Failed files do not fail entire job
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual timing note on fixture
