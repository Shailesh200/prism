# M-012 — Feature Graph v1

| Field | Value |
|---|---|
| Branch | `milestone/M-012-feature-graph` |
| Status | Verified |
| Depends on | M-010, M-011 |
| Unlocks | M-013, M-016 |
| Packages | `@prism/intelligence`, `@prism/graph-engine`, `@prism/core` |

## Goal

Infer a **feature-first** graph: clusters of code that represent product features/capabilities, enabling Map navigation and feature routes.

## In Scope

- Heuristics v1: directory boundaries, route folders, package names, naming conventions, README section hints
- Feature nodes linked to files/symbols
- Confidence scores on inferred features
- Core API: `getFeatureGraph()`, `listFeatures()`
- ADR: feature inference principles (explainable, tunable)

## Out of Scope

- ML clustering models
- Perfect product-domain understanding

## Definition of Done

- [x] Fixture repo yields ≥N expected features (documented) — **N = 4** (`auth`, `billing`, `checkout`, `dashboard`) in `packages/intelligence/fixtures/m012-features/README.md`
- [x] Each feature lists member files
- [x] Verify + PROGRESS + owner approval

## ADR

- [ADR-0011](../adr/0011-feature-inference-principles.md) — explainable, tunable heuristics

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual feature list review
