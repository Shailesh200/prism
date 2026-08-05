# ADR-0012: Repository health score weighting (v1)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-20 |
| Decision makers | Owner |
| Related milestones | M-015 |
| Supersedes | — |

## Context

Surfaces need a single, explainable repository health number. Inputs must stay **local** (index + graphs). Git churn is desirable but not always available.

## Decision

v1 `HealthScore.score` is a **weighted average** of factor scores in `[0, 100]`. Letter grade is derived from the overall score. Factor weights and grade bands are fixed below until a later ADR revises them.

### Factor weights (sum = 1.0)

| Factor id | Weight | Signal |
|---|---|---|
| `parse_health` | 0.25 | Share of indexed files with status `analyzed` |
| `test_presence` | 0.25 | Test-like files vs non-test source files |
| `coupling` | 0.25 | Import/re-export cycles (fewer → healthier) |
| `modularity` | 0.15 | Local packages and/or inferred features present |
| `diagnostics` | 0.10 | Analyzer diagnostics density |

Git **churn** is **not** a v1 factor (no silent git dependency). M-022 may add weighted factors via a new ADR.

### Grade bands

| Grade | Score |
|---|---|
| A | 90–100 |
| B | 80–89 |
| C | 70–79 |
| D | 60–69 |
| F | 0–59 |

Overall score is rounded to the nearest integer after weighting.

## Options Considered

### Option A — Weighted factors (chosen)

- Pros: explainable; extensible; matches existing `HealthScore.factors`
- Cons: weights are opinionated

### Option B — Single opaque ML / heuristic blob

- Pros: flexible later
- Cons: not explainable; violates Prism “evidence” culture

## Consequences

- Positive: deterministic fixture tests; Core `getHealth()` is thin
- Negative: scores may shift when weights change (document in changelog / ADR)
- Follow-ups: optional churn factor; Map health layer (M-019)

## Compliance

- [x] Milestone M-015 documents DoD against this ADR
- [x] `@repo-prism/core` README notes `getHealth()`
- [ ] — no Master Plan roadmap change beyond existing M-015 row
