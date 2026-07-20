# M-017 — Repository Map Data Model

| Field | Value |
|---|---|
| Branch | `milestone/M-017-map-data-model` |
| Status | Verified |
| Depends on | M-016, M-041 Gate A |
| Unlocks | M-018 |
| Packages | `@prism/repository-map`, `@prism/core`, `@prism/shared` |

## Goal

Define the **Map model**: zoom levels, layers, nodes/clusters, bookmarks, landmarks, and search indexes—independent of React rendering.

## In Scope

- Zoom level taxonomy (repo → package → feature → file → symbol)
- Layer descriptors (architecture, dependency, activity, ownership, debt, risk, performance, coverage)
- Clustering / aggregation rules per zoom
- Bookmarks & landmarks persistence schema (local)
- Search index over map entities
- Core API: `getRepositoryMap(options)`

## Out of Scope

- Visual styling / React Flow
- Real git activity layer data (may stub activity until M-022)

## Definition of Done

- [x] Map model golden JSON for fixture (`map-feature.golden.json`)
- [x] Zoom in/out transforms tested
- [x] Core `getRepositoryMap` wired (`INDEX_REQUIRED` without index)
- [x] `bun run verify:milestone` green
- [x] Owner approval → commit → merge → then M-018 (Map UI)

## Verification

`bun run verify:milestone`
