# M-020 — Change Impact Engine (Blast Radius)

| Field | Value |
|---|---|
| Branch | `milestone/M-020-blast-radius` |
| Status | Verified |
| Depends on | M-010, M-011 |
| Unlocks | M-021, M-025 |
| Packages | `@repo-prism/impact`, `@repo-prism/core` |

## Goal

Compute **blast radius** for a change target (file/symbol): transitive dependents, risk score, and human/agent-readable impact report.

## In Scope

- Forward impact (who depends on me) and reverse (what I depend on)
- Depth limits + truncation markers
- Risk score heuristic (fan-out, centrality, test coverage presence)
- Core API: `blastRadius(target, options)`
- Golden reports for fixture edits

## Out of Scope

- Auto-fix / code modification
- ML regression models
- Safe delete completeness (M-021)

## Design notes

### Traversal

Blast radius is **reverse reachability** over the file dependency graph
(`buildDependencyGraph`). Starting from the change origin, every file that
transitively imports it is "affected", tagged with a `depth` (import distance)
and a `reason` (`imports <file>` / `re-exports <file>`).

- **File target** — seed = the file itself; its importers cascade.
- **Symbol target** — resolved via the knowledge graph (`buildKnowledgeGraph`).
  Seeds = the files that *reference* the symbol (`references <name>`, depth 1);
  their dependents then cascade.
- **Depth limit + truncation** — traversal stops at `maxDepth` (default 6). When
  unexplored dependents remain at the limit the report sets `truncated: true`.

### Risk score (0–100, deterministic)

```
risk = round(clamp(
    55 * reachRatio                       // share of the repo impacted
  + min(30, directDependents * 5)         // immediate fan-in
  + (anyTestAffected ? 0 : 15)            // untested-change penalty
, 0, 100))
```

where `reachRatio = affectedFiles / max(1, analyzedFiles - 1)` and
`directDependents` is the count of depth-1 affected files. `testsLikelyAffected`
is the subset of affected files matching test conventions
(`*.test.*`, `*.spec.*`, `__tests__/`).

## Definition of Done

- [x] Blast radius for known symbol matches golden set (`packages/core/src/fixtures/blast-radius-*.golden.json`)
- [x] Risk score documented (see Design notes)
- [x] `@repo-prism/impact` engine + unit tests; Core `blastRadius()` wired; `impact` capability flipped on
- [x] Verify + PROGRESS + owner approval (approved & merged 2026-07-22)

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual report review
