# M-005 — Filesystem, Ignore & Hashing

| Field | Value |
|---|---|
| Branch | `milestone/M-005-fs-ignore-hash` |
| Status | Verified |
| Depends on | M-004 |
| Unlocks | M-040 |
| Packages | `@repo-prism/indexer` (fs layer), `@repo-prism/shared` |

## Goal

Reliable workspace traversal: respect `.gitignore` / Prism ignore rules, skip `node_modules` and binaries, content hashing for incremental invalidation.

## In Scope

- Workspace root resolution
- Ignore engine (gitignore-compatible + `.prismignore`)
- File inventory with mtime + content hash (blake3 or sha256 — ADR)
- Binary / oversized file policy
- Fixture-based tests

## Out of Scope

- AST parsing
- SQLite persistence (M-008) — may emit in-memory inventory only

## Definition of Done

- [x] Inventory API returns deterministic ordered file list for fixture
- [x] Ignore rules covered by tests
- [x] Hash stable across runs
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration (fixture walk) · Build · Perf smoke on medium fixture (optional note)
