# M-003 — Core Architecture Skeleton

| Field | Value |
|---|---|
| Branch | `milestone/M-003-core-skeleton` |
| Status | Not Started |
| Depends on | M-002 |
| Unlocks | M-004 |
| Packages | `@prism/core` |

## Goal

Establish `@prism/core` as the **only** public SDK façade. Define the client entrypoint shape (`Prism.create`, `openRepository`, lifecycle) with stubbed methods that throw `NotImplemented` or return empty structured results.

## In Scope

- `Prism` / `PrismWorkspace` API surface sketch (typed)
- Lifecycle: open → analyze (stub) → close
- Capability flags / version metadata
- Dependency wiring placeholders for analyzer/indexer/graph (interfaces only)
- ADR: “Core is the only supported integration surface”

## Out of Scope

- Real indexing or analysis
- MCP/CLI/extension consumption beyond type imports

## Definition of Done

- [ ] Public API module documented in `packages/core/README.md`
- [ ] Consumers can construct a client against a fixture path (no-op analyze)
- [ ] ADR accepted for façade rule
- [ ] `bun run verify:milestone` green; PROGRESS updated; owner approved

## Verification

Typecheck · Lint · Unit (construction + lifecycle) · Build · Manual API walkthrough

## Owner Approval Checklist

- [ ] API names feel right for long-term stability
- [ ] No surface packages bypass Core in design
