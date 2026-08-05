# ADR-0004: Core is the only supported integration surface

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-20 |
| Decision makers | Owner, Architect |
| Related milestones | M-003, M-025, M-026+ |
| Supersedes | — |

## Context

Prism exposes intelligence through MCP, CLI, VS Code, Cursor, and Playground. Without a single façade, each surface risks reimplementing analysis, diverging DTOs, or coupling to engine internals (indexer, graph, analyzer).

## Decision

**All user-facing surfaces consume `@repo-prism/core` only.** Engine packages (`analyzer`, `indexer`, `graph-engine`, domain engines) are internal implementation details wired by Core via typed ports. Surfaces must not import those packages for product behavior.

## Options Considered

### Option A — Core-only façade (chosen)

- Pros: One API to evolve; shared DTOs via `@repo-prism/shared`; easier privacy/local-first guarantees; MCP tools stay thin JSON adapters.
- Cons: Core must grow carefully; temporary stubs until engines land.

### Option B — Surfaces call engines directly

- Pros: Slightly less indirection early.
- Cons: Duplicated logic; inconsistent errors; harder to freeze a stable SDK (M-025).

## Consequences

- Positive: Clear dependency rule for agents and contributors; ADR + README enforce the boundary.
- Negative: Early Core methods return stub / `UNSUPPORTED` until engines wire in.
- Follow-ups: M-025 freezes the public Core surface; MCP/CLI/extensions land as Core consumers only.

## Compliance

- [x] Updates Master Plan if roadmap impacted — no roadmap change (already stated in AGENTS.md)
- [x] Updates package README(s) if API impacted — `packages/core/README.md`
- [x] Linked from milestone DoD — M-003
