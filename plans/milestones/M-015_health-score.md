# M-015 — Repository Health Score v1

| Field | Value |
|---|---|
| Branch | `milestone/M-015-health-score` |
| Status | Verified |
| Depends on | M-014 |
| Unlocks | M-022, M-025 |
| Packages | `@repo-prism/intelligence`, `@repo-prism/core`, `@repo-prism/shared` |

## Goal

Compute a deterministic **repository health score** (0–100 + letter grade + explainable factors) from the local index and graphs — no network, no required git history for v1.

## In Scope

- `HealthScore` DTO (already in `@repo-prism/shared`) filled by a pure scorer
- Factors from index/graph signals: parse health, test presence, coupling (cycles), modularity, diagnostics
- Weighting documented in [ADR-0012](../adr/0012-health-score-weighting.md)
- Core: `workspace.getHealth()` (requires prior `index()`)
- Deterministic fixture tests

## Out of Scope

- Git churn / ownership (stubbed until available; M-022 may enrich)
- Map UI health layer styling (M-018 / M-019)
- Blast radius / risk heatmaps (M-020)

## Definition of Done

- [x] `computeHealthScore(snapshot)` returns schema-valid `HealthScore`
- [x] Factors have stable ids + notes; overall score is weighted average
- [x] Empty / sparse repos score without throwing
- [x] ADR-0012 accepted
- [x] Core `getHealth()` wired; `INDEX_REQUIRED` when no snapshot
- [x] `bun run verify:milestone` green
- [x] Owner approval → commit → merge → then M-016

## Verification

`bun run verify:milestone`
