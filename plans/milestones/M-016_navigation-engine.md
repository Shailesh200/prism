# M-016 — Navigation Engine

| Field | Value |
|---|---|
| Branch | `milestone/M-016-navigation-engine` |
| Status | Verified |
| Depends on | M-010, M-012 |
| Unlocks | M-017, M-025 |
| Packages | `@repo-prism/navigation`, `@repo-prism/core`, `@repo-prism/shared` |

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

- [x] Path tests on fixture (known routes)
- [x] Empty-route case handled cleanly (`routes: []`, `empty: true`)
- [x] Shared `NavigationRoute` / `Landmark` DTOs
- [x] `bun run verify:milestone` green
- [x] Owner approval → commit → merge → then M-017

## Verification

`bun run verify:milestone`
