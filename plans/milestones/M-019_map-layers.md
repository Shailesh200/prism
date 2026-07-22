# M-019 — Map Layers & Views

| Field | Value |
|---|---|
| Branch | `milestone/M-019-map-layers` |
| Status | In Progress |
| Depends on | M-018 |
| Unlocks | M-031 (map layers in IDE) |
| Packages | `@prism/repository-map`, `@prism/ui`, `apps/playground`, `@prism/core` (consume only) |

## Goal

Make Repository Map **layers** first-class in the playground: toggleable views with a legend and layer-specific styling, consuming `@prism/core` map data (no reimplementation of analysis in the UI).

## In Scope

- Layer set: architecture, dependency, activity, ownership, debt, risk, performance, coverage
- UI: layer toggles + legend + layer-specific node/edge styling in `@prism/ui`
- Playground: wire active layers through `getRepositoryMap` / map client
- At least **5** layers render with visible styling on the fixture repo
- Honest stubs for layers that await later milestones (activity→M-022, risk heat→M-020, etc.) — still toggleable with local heuristic styling where data exists

## Out of Scope

- Full git churn / CODEOWNERS product (may use local heuristics or empty states)
- Blast-radius engine (M-020)
- VS Code webview packaging (M-030+)
- Treemap animation polish (deferred from M-018)

## Definition of Done

- [x] ≥5 layers render on playground fixture with distinct styling
- [x] Toggle + legend in map UI (`@prism/ui`)
- [x] Active layers affect map fetch / view (Core map options)
- [x] `bun run verify:milestone` green
- [ ] Owner approval → commit → merge → then next milestone from `main`

## Verification

`bun run verify:milestone` · Manual playground: toggle layers on fixture, confirm legend + styling
