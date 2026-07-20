# M-020 — Change Impact Engine (Blast Radius)

| Field | Value |
|---|---|
| Branch | `milestone/M-020-blast-radius` |
| Status | Not Started |
| Depends on | M-010, M-011 |
| Unlocks | M-021, M-025 |
| Packages | `@prism/impact`, `@prism/core` |

## Goal

Compute **blast radius** for a change target (file/symbol): transitive dependents, risk score, and human/agent-readable impact report.

## In Scope

- Forward impact (who depends on me) and reverse (what I depend on)
- Depth limits + truncation markers
- Risk score heuristic (fan-out, centrality, test coverage presence)
- Core API: `blastRadius(target, options)`
- Golden reports for fixture edits

## Out of Scope

- Auto-fix / code modification
- ML regression models
- Safe delete completeness (M-021)

## Definition of Done

- [ ] Blast radius for known symbol matches golden set
- [ ] Risk score documented
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual report review
