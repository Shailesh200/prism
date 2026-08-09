# M-053 — Number / label audit

| Field | Value |
|---|---|
| Milestone | [M-053](../milestones/M-053_presentation-consolidation.md) |
| Date | 2026-08-08 |
| Branch | `milestone/M-053-presentation-consolidation` |
| Rule | Refactors must not change numbers. Deliberate corrections carry an `N-xx` id. |

## Baseline line counts (2026-08-08, before Phase 2)

| File | Lines |
|---|---:|
| `packages/app-shell/src/DomainScreen.tsx` | 5,438 |
| `apps/playground/src/map-client.ts` | 1,293 |
| `packages/vscode-extension/src/webview/host-client.ts` | 1,092 |
| `packages/app-shell/src/github-ci.ts` | 623 |
| `packages/app-shell/src/cwv-parse.ts` | 484 |

Screenshot baselines: captured during owner smoke (T-01) of six domain screens + Overview + Map before merge.

## Corrections (N-01 … N-19)

| Id | Location | Before | After | Number changed? |
|---|---|---|---|---|
| N-01 | `RepositoryMapView` coverage row | Label `Test coverage`, value `N%` | Label `Test proximity`, InfoTip clarifies proximity heat not line coverage | No (label only) |
| N-02 | `RepositoryMapView` activity row | Label `Churn (activity)`, value `N%` | Label `Activity (recent edits)`, heat 0–100 (no `%`) | No (unit label only) |
| N-03/N-04 | DomainScreen CWV ratings | Rating shown without lab/field provenance | Source labelled `Lab (Lighthouse)` / `Field (CrUX)` | No |
| N-05 | Overview Coupling tooltip | Formula mismatched analysed-file denominator | Tooltip states analysed-file denominator; decision-first | No |
| N-06 | Overview Region Health tooltip | Formula-first, unclear denominator | Decision-first; real denominator | No |
| N-07 | `getOverviewModel` zoom | Silent default `feature` | Explicit `zoom` option; echoed on DTO | No (echo only) |
| N-08 | `OverviewTotals.files` | Count of `kind===file` graph nodes (0 at feature/package zoom) | Count from index snapshot (zoom-independent) | **Yes — corrects undercount** |
| N-09 | Playground blast status | Hardcoded `>=70`/`>=40` (both → warning) | `riskToBand` from `@repo-prism/shared` | Band may change to match Core |
| N-10 | M-035 perf docs | Missing baseline note; conflicting 50k numbers | Docs reconciled | Docs only |
| N-11 | `OverviewConnectedNode` | No `kind`; UI says "files" | Additive `kind`; render real kind | No (label accuracy) |
| N-12 | TestingSecurityScreen scores | `—/100` when null | Hide `/100` when null; "No score yet — Analyze" | No |
| N-13 | DomainsScreen detected count | Always ≥1 (`devops_platform`) while DNA null | Skeleton until DNA; DevOps excluded from "detected" | Count may drop to 0 until load |
| N-14 | Overview trends copy | "not available yet" | Link to Trends | No |
| N-15 | Domain CI actor | Bare `—` | "No actor" (ADR-0029) | No |
| N-16 | DomainScreen `relativeTime` | Local reimplementation | Import from `@repo-prism/ui` | No |
| N-17 | Trends / Blast errors | Text only | "Try again" button | No |
| N-18 | A11y | Missing nav labels, modal focus, health ring AT | Labels + focus trap + live region | No |
| N-19 | Integrations MCP/CLI cards | `coming_soon` | `available` + accurate install copy | No |

## Characterisation baselines (must stay green after moves)

- `packages/app-shell/src/cwv-parse.test.ts`
- `packages/app-shell/src/github-ci.test.ts`
- `packages/app-shell/src/domain-aggregations.test.ts`
