# ADR-0062: Prism Graph replaces the Repository Map

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-10) |
| Date | 2026-10-10 |
| Milestone | [M-096 Graph model, artifact, `graph` tool](../milestones/M-096_graph-artifact-tool.md) |
| Amends | [ADR-0057](./0057-prism-intelligence-unified-product.md) (Repository Map removed from the product) |
| Program | [PROGRAM_focus-reset.md](../milestones/PROGRAM_focus-reset.md) §7 |

## Context

ADR-0057 removed the Repository Map because a map whose only job is showing the map is not a use case. That was right. But developers value an always-current knowledge graph they can query and look at (the graphify pattern), and agents need one structural query surface instead of seven overlapping tools.

## Decision

1. **Prism Graph** is one local graph per repository. Nodes: packages, files, symbols, tests, routes, docs, ADRs, commits, authors, memories, configs. Edges: imports, references, tests, mentions, rationale_for, co-changes, ownership, configures. Every edge carries provenance (`measured`, `heuristic`, `inferred`).
2. It ships only with **three jobs**:
   - answering the agent through one `graph` tool (`find`, `neighbors`, `path`, `explain`, `query`), bounded and budgeted;
   - a **blast overlay**;
   - a shareable offline artifact (`graph.html`, `GRAPH_REPORT.md`, `graph.json`).

   Without all three, it does not ship.
3. No model and no network are used to build or render it.
4. `graph` replaces `find_symbol`, `search_symbols`, `find_references`, `dependency_route`, `explain_area`, `knowledge_graph` and `dependency_graph` in the default MCP set. They stay behind `PRISM_MCP_FULL` for one milestone, then are removed.

## Consequences

- `getRepositoryMap` and the `@repo-prism/ui` graph code are reused; no second renderer.
- M-059's remaining reference-precision work becomes a prerequisite inside M-096.
