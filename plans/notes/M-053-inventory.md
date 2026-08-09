# M-053 Phase 1 — Presentation / remaining analysis inventory

| Field | Value |
|---|---|
| Milestone | [M-053](../milestones/M-053_presentation-consolidation.md) |
| Date | 2026-08-08 |
| Branch | `milestone/M-053-presentation-consolidation` |
| Prior | [M-052-inventory](./M-052-inventory.md) — partially stale after M-052 Verified |
| Scope | `packages/app-shell`, `packages/vscode-extension`, `apps/playground` |
| Rule | [ADR-0004](../adr/0004-core-only-integration-surface.md) — surfaces consume Core; no reimplemented analysis |

## What counts as analysis

Parsing external artifacts (Lighthouse JSON, PageSpeed, GitHub REST shapes),
aggregation and rollup, scoring, thresholding, heuristic classification, and
derivation of one data shape from another.

**Not** analysis: formatting, icons/colours, layout geometry, display sort/slice,
React state, transport plumbing.

## Baseline sizes (2026-08-08)

| File | Lines |
|---|---:|
| `packages/app-shell/src/DomainScreen.tsx` | 5,468 |
| `apps/playground/src/map-client.ts` | 1,293 |
| `packages/vscode-extension/src/webview/host-client.ts` | 1,092 |
| `packages/app-shell/src/github-ci.ts` | 623 |
| `packages/app-shell/src/cwv-parse.ts` | 484 |

**Six domains in `DomainScreen`:** `backend`, `devops_platform`, `mobile`,
`desktop`, `data_ml_ai`, `frontend`.

## Already done in M-052 (not remaining)

| Item | Where it landed |
|---|---|
| Overview aggregations | `@repo-prism/shared` + Core `getOverviewModel` |
| Extension test runners / parsers | Core `runWorkspaceTests` / `listWorkspaceTests` |
| ~450 duplicated lines in `host-dispatch` | Deleted |

---

## 1. Cross-surface divergence (finding, not silent fix)

| Topic | Playground | VS Code / webview | Notes |
|---|---|---|---|
| **CWV ingest parse** | Lab via Core job → `getCwvReport` | Browser parse via `cwv-parse` on import + PageSpeed (`DomainScreen`) | Webview can hold a CWV report Core never saw |
| **Frontend routes** | Core `discoverFrontendRoutes()` only | Merges Core routes with client `heuristicFrontendRoutes` | Client heuristic ⊆ intelligence `discoverFrontendAppRoutes` |
| **Rename apply** | `vite.config.ts` + app-shell `rewritePathReferences` | `vscode-extension/apply-rename.ts` + same rewrite | Rewrite lives in app-shell, not Core |
| **GitHub CI / PageSpeed** | Client `github-ci.ts` (no Core consent on these fetches) | Same module | Core has only `stageDevopsRemote` (consent-gated) |

Characterisation tests must pin today's behaviour **including** divergences.
Choosing a single source of truth is Phase 2 / 4 work and must be written down
when decided — not sneaked into a move.

---

## 2. Move to `@repo-prism/intelligence`

| Symbol | Location | Computes | Equivalent today |
|---|---|---|---|
| `ratingFromScore`, `pickNumeric`, `pickScore`, `metric` | `cwv-parse.ts` | LHR audit → metric + rating band | `utilities/cwv.ts` |
| `insightsFromAudits` | `cwv-parse.ts` | Audits → `CwvInsight[]` | `insightsFromLighthouse` (richer) |
| `metricsFromLighthouseJson` | `cwv-parse.ts` | LHR / PageSpeed JSON → metrics, TBT, categories, insights | `cwvMetricsFromLighthouse` + helpers |
| `cwvReportFromLighthouseJson` | `cwv-parse.ts` | LHR JSON → `CwvReport` | `buildCwvReport` |
| `heuristicFrontendRoutes` | `cwv-parse.ts` | Next app/pages paths → routes | `routeFromPageFilePath` + `discoverFrontendAppRoutes` |
| `scoreRating` | `cwv-parse.ts` | 0–1 → rating band | same as `ratingFromScore` |
| `fileStem` | `DomainScreen.tsx` | Path → stem for test↔screen match | None |
| `screenCoverage` | `DomainScreen.tsx` | Mobile screens ↔ QA overlay tests | → part of `getDomainReport("mobile")` |
| DevOps findings fallback | `DomainScreen.tsx` | Flag CI nodes missing concurrency/permissions when overlay empty | Overlaps `overlays.ts` |
| `desktopIpcChannels` | `DomainScreen.tsx` | Regex IPC channels from findings | Partly in overlay |

**Convergence target (M-053 §2.4):** one parse path in intelligence; surface
keeps only display helpers (`formatCwvValue`, `ratingLabel`, `ratingClass`,
`LIGHTHOUSE_CATEGORIES`, `lighthouseProgressFromJobEvent`).

---

## 3. Move to `@repo-prism/core`

| Symbol | Location | Computes | Core today |
|---|---|---|---|
| Per-domain aggregations (`routeBreakdown`, `componentBreakdown`, `coverage`, inbound rankings, etc.) | `DomainScreen.tsx` | Domain report view-models | **Missing** — `getDomainReport(domain)` |
| `inboundDepCounts` / `normalizeDepKey` / `lookupInbound` | `DomainScreen.tsx` | In-degree map over dep graph | None exported |
| `parseGithubRepoRef`, `matchRemoteWorkflowId` | `github-ci.ts` | Repo ref + workflow id match | None |
| `fetchGithub*` / `dispatchGithubWorkflow` / `fetchPagespeedMetrics` | `github-ci.ts` | Network I/O + DTO mapping | Partial: `stageDevopsRemote` only |
| `rewritePathReferences`, `resolveRenameToPath` | `apply-rename.ts` | Import/path rewrite for rename | None |
| `checkHealthRegression` / `REGRESSION_THRESHOLD` | `vscode-extension/health-alerts.ts` | ≥5 pt drop / region mover policy | History APIs exist; no policy API |
| `detectTestCommand` | `vscode-extension/.../prism-panel.ts` | Lockfile / scripts → terminal command | Overlaps Core test runner detection |

`github-ci` classification **supersedes** M-052 §4 (“network adapters stay”):
M-053 §2.3 requires Core + consent gate so MCP/CLI can share the same path.

---

## 4. Legitimately presentational — stays

| Area | Examples | Why |
|---|---|---|
| CWV display vocabulary | `formatCwvValue`, `ratingLabel`, `ratingClass`, `LIGHTHOUSE_CATEGORIES` | Labels / CSS, not facts |
| Lab progress adapter | `lighthouseProgressFromJobEvent` | Thin Zod → UI event |
| Stack / domain catalogs | `stack-signal-meta`, `DOMAIN_CATALOG`, security labels | Display vocabulary |
| Layout geometry | `BundleTreemap`, overview layouts, file trees | Pixels |
| Display ranking / filters | `mostDepended` / `churn` slices once Core owns the rows; Trends window filters; `buildSuiteTree` | Viewport sort/slice |
| Overview display leftovers | `scoreColor`, `activityGeometry`, Markdown export | Post–M-052 presentation |
| Form validation | `looksLikePagespeedKey`, `parseCiInputs` (form JSON) | UI forms |
| Gravatar | `md5`, `avatar-util` | Not repository analysis |
| Protocol / query plumbing | `protocol-guards`, vite `parseLayers` / `parseZoom` | Boundaries |
| Client transports | `map-client.ts`, `host-client.ts` | Unify as `PrismClient` (Phase 4) — not intelligence |

---

## 5. Core API gaps this milestone fills

| Surface | Status |
|---|---|
| `getDomainReport(domain)` | **Missing** — Phase 2 |
| CWV browser/import parse via intelligence | Split — Phase 2.4 |
| GitHub workflow list/dispatch / PageSpeed | **Done** (T-11 / ADR-0033) — Core + `network.github` / `network.pagespeed` |
| Rename rewrite on Core | **Missing** — candidate after domains |
| Health regression policy | **Missing** — candidate after domains |
| `PrismClient` + Http / PostMessage transports | **Done** (T-09) — `packages/app-shell/src/client/` |

---

## 6. Characterisation coverage plan

| Target | Test location | Status |
|---|---|---|
| `cwv-parse` parse / report / routes / ratings | `packages/app-shell/src/cwv-parse.test.ts` | Phase 1 |
| `parseGithubRepoRef`, `matchRemoteWorkflowId` | `packages/intelligence/src/utilities/github-ci.test.ts` (+ app-shell re-export test) | Done (T-11) |
| Domain pure helpers (inbound, fileStem) | `packages/app-shell/src/domain-aggregations.test.ts` | Phase 1 (extract for testability, no behaviour change) |
| Each `getDomainReport` domain | Core tests, one domain per commit | Phase 2 |
| Client RPC deadline / schema | Regression on unified transport | Phase 4 |

---

## 7. Order of work

1. Phase 1 inventory + characterisation (this file + tests)
2. CWV converge (`cwv-parse` → intelligence; surface display-only)
3. `getDomainReport` one domain at a time (frontend first unlocks CWV + routes)
4. `github-ci` behind Core consent
5. Screen primitive de-dupe (Phase 3) — only ≥3× verbatim
6. `PrismClient` unification (Phase 4)
7. Accessibility pass (Phase 5) — needs human on screens
8. Rename rewrite / health regression — if still in scope after domains; else log
