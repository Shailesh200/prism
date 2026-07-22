# ADR-0017: Engineering health report (complementary to HealthScore)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-22 |
| Decision makers | Owner |
| Related milestones | M-022 |
| Supersedes | — |
| Related | ADR-0012 (HealthScore weighting), ADR-0013 (git signals) |

## Context

M-015 delivers a single `HealthScore` from structural index/graph factors
(ADR-0012). The Master Plan also requires **engineering metrics** that need git
history when available (churn, knowledge decay, conflict risk) plus structural
signals (entropy, architecture drift, technical debt). Silently adding those as
weighted `HealthScore` factors would change grades whenever git appears and
violate ADR-0012’s “no silent git dependency” rule.

## Decision

### Option C — Separate report + Core API (chosen)

Ship a typed **`EngineeringHealthReport`** and Core **`getEngineeringHealth()`**:

- Metrics are first-class objects with stable ids, 0–100 scores
  (**higher = healthier**), evidence strings, and notes.
- Git-backed metrics **fail soft**: when git is unavailable, they return a
  neutral score (~50) with an explicit `note` / `gitAvailable: false` — they do
  **not** throw and do **not** alter `getHealth()`.
- ADR-0012 weights and `getHealth()` behavior remain unchanged in M-022.
- Future insights / MCP tools (M-024 / M-027) consume this report.

### Metric ids (stable)

| id | Primary signals |
|---|---|
| `entropy` | Unevenness of change (git) or import-degree dispersion (structural fallback) |
| `architecture_drift` | Cycles + cross-package import share |
| `technical_debt` | Parse failures + analyzer diagnostics density |
| `code_churn` | Concentration of additions/deletions (git) |
| `conflict_risk` | Multi-contributor + high-churn files (git) |
| `knowledge_decay` | Stale high-centrality / bus-factor files (git + fan-in) |

Hotspots are a ranked list (not a single score) combining debt / churn /
coupling signals per path.

## Options Considered

### Option A — Fold into HealthScore weights

- Pros: one number
- Cons: breaks ADR-0012; grades jump when git appears; harder to explain

### Option B — Metrics-only MCP later, no Core DTO now

- Pros: smaller milestone
- Cons: surfaces would invent heuristics; violates Core-only rule

### Option C — Separate report (chosen)

- Pros: explainable; git optional; preserves HealthScore; feeds M-024/M-027
- Cons: two health-ish APIs (documented)

## Consequences

- Positive: deterministic tests; Trends/Insights can show metric cards without
  inventing formulas
- Negative: callers must know `getHealth` vs `getEngineeringHealth`
- Follow-ups: optional ADR to blend selected metrics into HealthScore; MCP tools
  in M-027

## Compliance

- [x] Milestone M-022 documents DoD against this ADR
- [ ] Master Plan feature rows for entropy/drift/debt/churn/conflict/decay
