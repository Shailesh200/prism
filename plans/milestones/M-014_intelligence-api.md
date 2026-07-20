# M-014 — Repository Intelligence API

| Field | Value |
|---|---|
| Branch | `milestone/M-014-intelligence-api` |
| Status | Not Started |
| Depends on | M-013 |
| Unlocks | M-015, M-022, M-024, M-025 |
| Packages | `@prism/intelligence`, `@prism/core` |

## Goal

Unify DNA, graphs, and index into a cohesive **Repository Intelligence** façade on `@prism/core` with stable method names used by all surfaces.

## In Scope

- Core methods composition: dna, graphs, summary, capabilities
- `IntelligenceReport` aggregate
- Consistency checks (graphs refer to indexed files)
- Developer docs: “Intelligence API guide”

## Out of Scope

- Health scoring formula (M-015)
- MCP exposure (M-026+)

## Definition of Done

- [ ] Single entry: `workspace.intelligence()` returns aggregate
- [ ] API documented + examples
- [ ] Integration test on fixture
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Docs review
