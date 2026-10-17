# M-009 — Graph Engine Foundations

| Field | Value |
|---|---|
| Branch | `milestone/M-009-graph-engine` |
| Status | Verified |
| Depends on | M-008 |
| Unlocks | M-010, M-011 |
| Packages | `@repo-prism/graph-engine` |

## Goal

Provide a typed graph store on **ngraph** (nodes/edges/attributes) with query primitives used by dependency, semantic, and feature graphs.

## In Scope

- Graph data model in `@repo-prism/shared`
- ngraph-backed store + thin typed façade
- CRUD + bulk load from index snapshot
- Queries: neighbors, subgraph, shortest path, degree
- Serialization to JSON for MCP/CLI
- Layout helper hook (dagre or ngraph layout bridge) — basic only

## Out of Scope

- Domain-specific builders (those are M-010+)
- Map UI

## Definition of Done

- [x] Graph engine package with unit tests for path/neighbors
- [x] Deterministic serialization for fixture
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Build · Perf microbench optional
