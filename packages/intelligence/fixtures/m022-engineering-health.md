# M-022 fixture notes — Engineering Health metrics

Metrics are unit-tested in
`packages/intelligence/src/health/engineering.test.ts` with synthetic
`IndexSnapshot` + optional `GitFileSignal` inputs (no network).

| Metric | What the tests assert | Primary signals |
|---|---|---|
| `entropy` | Present without git (structural fan-in fallback) | Shannon entropy of change weights or import degrees |
| `architecture_drift` | Always computed | Cycles + cross-package edge share |
| `technical_debt` | Drops when `failed` + diagnostics present | Parse failures / skipped + diagnostics density |
| `code_churn` | Neutral 50 without git; low when one file dominates lines | Top-10% share of additions+deletions |
| `conflict_risk` | Neutral without git; drops for ≥3 authors + ≥5 commits | Multi-contributor hot files |
| `knowledge_decay` | Soft without git; penalizes stale single-owner hubs | Fan-in + recency + contributor count |
| hotspots | Top path is the high-churn file when git present | Combined churn / debt / coupling / ownership / stale |

Core smoke: `packages/core/src/engineering-health.test.ts` indexes
`packages/intelligence/fixtures/m012-features` and asserts a schema-valid
`EngineeringHealthReport` (git soft-degrades if the fixture tree has no `.git`).

ADR-0012 `getHealth()` is unchanged — this report is complementary (ADR-0017).
