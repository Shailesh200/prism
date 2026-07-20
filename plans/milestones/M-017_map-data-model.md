# M-017 — Repository Map Data Model

| Field | Value |
|---|---|
| Branch | `milestone/M-017-map-data-model` |
| Status | Not Started |
| Depends on | M-016 |
| Unlocks | M-018 |
| Packages | `@prism/repository-map`, `@prism/core` |

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

- [ ] Map model golden JSON for fixture
- [ ] Zoom in/out transforms tested
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual JSON inspection
