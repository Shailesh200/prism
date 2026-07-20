# M-016 — Navigation Engine

| Field | Value |
|---|---|
| Branch | `milestone/M-016-navigation-engine` |
| Status | Not Started |
| Depends on | M-010, M-012 |
| Unlocks | M-017, M-025 |
| Packages | `@prism/navigation`, `@prism/core` |

## Goal

Provide path-finding and feature navigation: dependency routes, cross-feature jumps, architecture navigation helpers.

## In Scope

- Shortest / k-shortest dependency paths between files or symbols
- Feature → feature route via shared dependencies
- “Landmarks” resolution API (named entrypoints)
- Core API: `findRoute()`, `navigateFeature()`, `listLandmarks()`

## Out of Scope

- Map rendering
- IDE command wiring

## Definition of Done

- [ ] Path tests on fixture (known routes)
- [ ] Empty-route case handled cleanly
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build
