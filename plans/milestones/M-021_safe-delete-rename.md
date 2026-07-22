# M-021 — Safe Delete / Rename / Test Impact

| Field | Value |
|---|---|
| Branch | `milestone/M-021-safe-delete-rename` |
| Status | In Progress |
| Depends on | M-020 |
| Unlocks | M-025, M-029 |
| Packages | `@prism/impact`, `@prism/core` |

## Goal

Turn the blast-radius affected-set primitive into concrete change-safety
answers: can I delete this? what must I edit to rename it? which tests should I
run? is this change likely breaking?

## In Scope

- Core APIs: `safeDelete`, `renameImpact`, `testImpact`, `breakingChangeHints`
- File **and** symbol targets (symbols resolved via the knowledge graph)
- Safe delete: direct/transitive blockers + transitive orphan detection
- Rename impact: edit sites (files + reference counts) + affected files
- Test impact: tests transitively reachable from the change
- Breaking-change hints: exported symbol, subclassed/implemented, widely-used
- Golden reports on the `m011-refs` fixture

## Out of Scope

- Applying edits / codemods (report only, no writes)
- Cross-repo / published-package consumers
- ML regression / breaking-change prediction (M-035)
- Import-specifier-level rewrite planning (surfaced as affected files, not diffs)

## Design notes

All four APIs reuse the M-020 reverse-reachability primitive
(`computeAffected`) over the file dependency graph, plus the knowledge graph
for symbol resolution, reference sites, and heritage edges.

- **safeDelete** — `blockers` = every file that (transitively) depends on the
  target (empty ⇒ `safe: true`). `orphans` = files that become unreachable once
  the target is removed (fixpoint: a file whose every importer is in the removed
  set). Symbol targets report reference-site blockers; orphans are file-only.
- **renameImpact** — `editSites` = the declaration plus each referencing file
  with a reference `count`; `affectedFiles` = those paths; `breakingChanges` =
  the hints below.
- **testImpact** — the affected set filtered to test files (`*.test.*`,
  `*.spec.*`, `__tests__/`), each with depth + reason.
- **breakingChangeHints** (severity `info | warning | danger`):
  - `exported-symbol` (warning) — exported; importers may break
  - `subclassed` (danger) — extended/implemented elsewhere
  - `widely-used` (warning) — referenced/imported in ≥ 5 places

## Definition of Done

- [x] `safeDelete` / `renameImpact` / `testImpact` / `breakingChangeHints` in `@prism/impact` + Core
- [x] Golden reports on `m011-refs` fixture match (`packages/core/src/fixtures/*.golden.json`)
- [x] Heuristics documented (this doc)
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual report review
