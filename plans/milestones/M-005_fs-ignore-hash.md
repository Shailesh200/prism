# M-005 — Filesystem, Ignore & Hashing

| Field | Value |
|---|---|
| Branch | `milestone/M-005-fs-ignore-hash` |
| Status | Not Started |
| Depends on | M-004 |
| Unlocks | M-006 |
| Packages | `@prism/indexer` (fs layer), `@prism/shared` |

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

- [ ] Inventory API returns deterministic ordered file list for fixture
- [ ] Ignore rules covered by tests
- [ ] Hash stable across runs
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration (fixture walk) · Build · Perf smoke on medium fixture (optional note)
