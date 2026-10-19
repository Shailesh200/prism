---
title: Graphs
description: "Dependency, knowledge and feature graphs, three layers over one index."
---

Prism builds three related graphs from the same [index](/docs/concepts/repository-index).
They answer different questions.

## Dependency graph

Every file is a node; every import is a directed edge. Dependents *depend on
you* — they are the ones you can break.

| Handled | Not handled |
|---|---|
| Relative imports, path aliases, package entry points, re-exports, type-only imports | `require(variable)`, dynamic `import()` with computed paths, cross-language refs, runtime DI |

```bash
prism deps --packages
prism cycles
```

Cycles are not always bugs, but they reliably mean a boundary is not where
someone thought. Blast radius, safe delete, rename impact and Prepare all walk
this graph.

## Knowledge graph

The dependency graph knows that one file imports another. The knowledge graph
knows what those files *are*: symbols, packages, features, domains, routes —
plus edges like `defines`, `references`, `belongs to`, `tests`, `serves`.

```bash
prism symbol total
prism refs total
prism route "/api/cart"
prism explore src/features/cart.ts
```

Inferred edges carry confidence. A `defines` edge is certain; a feature at 40%
confidence is a suggestion. See [signal provenance](/docs/concepts/signal-provenance).

## Feature grouping (internal)

Prism groups files that implement one user-facing thing — from naming,
directories, import clustering, co-change (needs git), and routes. In 2.0 this
grouping is internal: it feeds `prepare_change` and `blast_radius` ranking and
is not exposed as its own command or tool. A grouping signal carries the same
confidence bands as any other inferred edge.

## Related

[Before you edit](/docs/guides/before-you-edit) · [Risk bands](/docs/concepts/risk-bands)
