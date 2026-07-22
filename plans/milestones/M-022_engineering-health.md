# M-022 — Engineering Health Metrics

| Field | Value |
|---|---|
| Branch | `milestone/M-022-engineering-health` |
| Status | Verified |
| Depends on | M-014, M-015 (health score), M-042 (local git signals) |
| Unlocks | M-024 Insights, M-027 MCP (`engineering_entropy`, `knowledge_decay`, …) |
| Packages | `@prism/intelligence`, `@prism/shared`, `@prism/core` |
| ADR | ADR-0017 |

## Goal

Ship **explainable engineering-health metrics** beyond M-015’s five structural
factors: entropy, architecture drift, technical debt, code churn, conflict risk,
knowledge decay, and ranked hotspots — all local, with `evidence` + notes, and
fail-soft when git history is missing.

## Context — what already exists (do NOT redo)

- **M-015 / ADR-0012:** `HealthScore` + `getHealth()` (parse / tests / coupling /
  modularity / diagnostics). **Leave weights unchanged** in this milestone.
- **M-042 / ADR-0013:** Core `getGitActivity()` / `readGitSignals` (per-file
  commits, churn, contributors, recency). Reuse as input; no new git IO.
- Playground Trends already shows raw git hotspots — M-022 formalizes metrics in
  Core; Trends wiring is optional polish, not required for DoD.

## In Scope

- **`EngineeringHealthReport` DTO** in `@prism/shared` with:
  - Named metrics: `entropy`, `architecture_drift`, `technical_debt`,
    `code_churn`, `conflict_risk`, `knowledge_decay` (each: id, label, score
    0–100 higher=healthier, optional severity, evidence[], note)
  - Ranked **hotspots** (path + kinds + score + evidence)
  - `gitAvailable` + `summary`
- **`computeEngineeringHealth()`** in `@prism/intelligence` (pure; takes
  `IndexSnapshot` + optional git file signals)
- **Core `getEngineeringHealth()`** — requires prior `index()`; injects git via
  existing cache (fail soft)
- **ADR-0017** — report is complementary to `HealthScore` (does not silently
  reweight ADR-0012)
- Unit tests + fixture explanations per metric family

## Out of Scope

- Changing ADR-0012 factor weights / overall `HealthScore` grade formula
- MCP tool registration (M-027) — DTO + Core API only
- Historical health time-series storage
- ML / remote analytics
- Playground Trends UI redesign (may consume the API later)

## Definition of Done

- [x] Schema + `computeEngineeringHealth` + fixtures/unit tests for each metric
- [x] Core `getEngineeringHealth()` wired; soft-degrades without git
- [x] ADR-0017 Accepted; PROGRESS updated
- [x] `bun run verify:milestone` green
- [ ] Owner approval → commit → merge → Verified

## Verification

`bun run verify:milestone`
