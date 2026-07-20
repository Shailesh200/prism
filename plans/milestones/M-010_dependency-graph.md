# M-010 — Dependency Graph

| Field | Value |
|---|---|
| Branch | `milestone/M-010-dependency-graph` |
| Status | Verified |
| Depends on | M-009 |
| Unlocks | M-012, M-016, M-020 |
| Packages | `@prism/graph-engine`, `@prism/intelligence` (builder), `@prism/core` |

## Goal

Build a file/module dependency graph from analyzer import/export edges, with package-boundary awareness (npm workspace packages).

## In Scope

- Nodes: files, packages (optional aggregation)
- Edges: imports, re-exports
- Cycle detection
- Core API: `getDependencyGraph()`, `getCycles()`
- Fixture golden graph

## Out of Scope

- Runtime dynamic `import()` resolution guarantees
- External npm registry fetches (local package.json only)

## Definition of Done

- [x] Cycles detected on intentional fixture
- [x] Package aggregation mode works
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual Graph JSON review
