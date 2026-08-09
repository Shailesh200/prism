# M-052 Phase 1 — Surface analysis inventory

| Field | Value |
|---|---|
| Milestone | [M-052](../milestones/M-052_surface-consolidation.md) |
| Date | 2026-08-05 |
| Scope | `packages/app-shell/src/**`, `packages/vscode-extension/src/**`, `apps/playground/**`, `packages/ui/src/**` |
| Rule under test | [ADR-0004](../adr/0004-core-only-integration-surface.md) — surfaces consume `@repo-prism/core` and never reimplement analysis |

## What counts as analysis here

Parsing external artifacts (Lighthouse JSON, test output, coverage, bundle
stats), aggregation and rollup, scoring, thresholding, heuristic
classification, and derivation of one data shape from another.

**Not** analysis: formatting numbers, choosing icons or colours, layout
geometry, sorting for display, React state.

The distinction matters because it decides what MCP and CLI can reach. A
number a React component computes is a number an agent cannot have.

## Baseline sizes

| File | Lines |
|---|---:|
| `packages/app-shell/src/DomainScreen.tsx` | 5,465 |
| `apps/playground/vite.config.ts` | 1,356 |
| `packages/vscode-extension/src/host-dispatch.ts` | 998 |
| `packages/app-shell/src/github-ci.ts` | 623 |
| `packages/app-shell/src/cwv-parse.ts` | 484 |
| `packages/app-shell/src/overview-model.ts` | 399 |
| `packages/app-shell/src/stack-signal-meta.ts` | 222 |
| `packages/app-shell/src/md5.ts` | 176 |
| `packages/app-shell/src/apply-rename.ts` | 122 |

---

## 1. Findings — cross-surface divergence

The most serious class of finding, because it means the IDE and the playground
can give different answers about the same repository. Recorded here rather
than silently resolved, per M-052 §3 principle 1.

| Topic | Playground | VS Code extension | Divergence |
|---|---|---|---|
| **Run workspace tests** | Calls Core `runLocalWorkspaceTests` (`vite.config.ts:392–428`) | Reimplements the runner and all three parsers locally (`host-dispatch.ts:554–998`) | Same intent, two implementations, ~450 duplicated lines. Core's copy is the one under test |
| **Lighthouse / CWV ingest** | Never parses an LHR in the surface — Core job then `getCwvReport` | Parses imported and PageSpeed JSON in the browser via `cwv-parse.ts` (`DomainScreen.tsx:1907–1952`) | The webview can produce a CWV report Core has never seen |
| **Frontend route discovery** | Core `discoverFrontendRoutes()` only | Merges Core routes with a client-side `heuristicFrontendRoutes` derived from DNA evidence paths (`DomainScreen.tsx:1480–1516`) | The client heuristic is a strict subset of the intelligence implementation, so the extension can show routes the playground does not, and vice versa |
| **Rename rewrites** | `applyRenameOnDisk` in `vite.config.ts:707–772` | `apply-rename.ts:38–180` | Both call the *same* `rewritePathReferences` — but it lives in `@repo-prism/app-shell`, so no non-UI surface can rename safely |

`cwv-parse.ts` carries a header comment admitting it mirrors the intelligence
CWV helpers "for webview import". The duplication was deliberate and is now
paid down.

---

## 2. Move to `@repo-prism/core`

| Symbol | Location | Lines | Computes | Core equivalent today |
|---|---|---:|---|---|
| `extractTestResultsJson` | `host-dispatch.ts:616–651` | 36 | Pulls the Jest/Vitest JSON blob out of mixed stdout | **Identical** to `core/testing/local-runners.ts:123–157` |
| `parseJestLikeResults` | `host-dispatch.ts:658–697` | 40 | Jest-shaped `testResults` → `TestingTestResult[]` | **Identical** to `local-runners.ts:159–198` |
| `parseCommandResults` | `host-dispatch.ts:699–706` | 8 | stdout/stderr parse wrapper | `local-runners.ts:200–207` |
| `runWorkspaceTests` | `host-dispatch.ts:741–891` | 151 | Runner orchestration + parse | `runLocalWorkspaceTests` |
| `parseVitestListJson` | `host-dispatch.ts:894–929` | 36 | Vitest `list --json` → file tree | `local-runners.ts:357+` |
| `parseJestListTests` | `host-dispatch.ts:932–942` | 11 | Jest `--listTests` → files | `local-runners.ts:395+` |
| `listWorkspaceTests` | `host-dispatch.ts:947–998` | 52 | Discovery orchestration | `listLocalWorkspaceTests` |
| `detectPackageManager`, `hasPackageTestScript` | `host-dispatch.ts:554–580` | 27 | PM detection from lockfiles | `local-runners.ts:68–93` |
| `rewritePathReferences`, `resolveRenameToPath` | `app-shell/src/apply-rename.ts:47–122` | 70 | Rewrites import specifiers and path strings for a rename | None — and both surfaces need it |
| `couplingDensity`, `couplingBadge` | `overview-model.ts:52–64` | 11 | edges ÷ nodes, then Low/Medium/High bands | None |
| `regionFileCount`, `deriveRegions` | `overview-model.ts:67–130` | 62 | Files per region; region degree and a heuristic health score | None |
| `deriveMostConnected` | `overview-model.ts:138–162` | 25 | Top-N nodes by degree | None |
| `bucketActivity` | `overview-model.ts:220–246` | 27 | Daily git buckets → day/week rollup | None |
| `inboundDepCounts` | `DomainScreen.tsx:567–584` | 18 | In-degree map over the dependency graph | None exported |
| `checkHealthRegression` | `vscode-extension/src/health-alerts.ts:13–70` | 58 | Flags a ≥5-point health drop | None — this is policy, not display |

## 3. Move to `@repo-prism/intelligence`

| Symbol | Location | Lines | Computes | Intelligence equivalent today |
|---|---|---:|---|---|
| `ratingFromScore`, `pickNumeric`, `pickScore`, `metric` | `cwv-parse.ts:23–62` | 40 | Lighthouse audit → CWV metric + rating band | `utilities/cwv.ts:21–60` |
| `insightsFromAudits` | `cwv-parse.ts:148–249` | 102 | Audits → `CwvInsight[]` | `insightsFromLighthouse` (`cwv.ts:261–427`), which additionally handles layout-shift audits and byte weights |
| `metricsFromLighthouseJson` | `cwv-parse.ts:262–333` | 72 | LHR/PageSpeed JSON → metrics, TBT, category scores | `cwvMetricsFromLighthouse` + `tbtMsFromLighthouse` + `categoryScoresFromLighthouse` |
| `cwvReportFromLighthouseJson` | `cwv-parse.ts:335–373` | 39 | LHR JSON → `CwvReport` | `buildCwvReport` (`cwv.ts:544–584`) |
| `heuristicFrontendRoutes` | `cwv-parse.ts:376–405` | 30 | Next app/pages path → URL routes | `routeFromPageFilePath` + `discoverFrontendAppRoutes` |
| `scoreRating` | `cwv-parse.ts:432–439` | 8 | 0–1 score → rating band | Same as `ratingFromScore` |
| `fileStem` | `DomainScreen.tsx:586–593` | 8 | Path → stem for test matching | None |
| `screenCoverage` | `DomainScreen.tsx:1028–1045` | 18 | Mobile screen ↔ test file matching | None |
| `desktopIpcChannels` | `DomainScreen.tsx:1282–1320` | 39 | Regex-extracts IPC channel names | Partly in the utility overlay |
| DevOps findings fallback | `DomainScreen.tsx:967–990` | 24 | Flags missing CI concurrency/permissions when the overlay is empty | Overlaps the utility overlay |
| `routeBreakdown` | `DomainScreen.tsx:1533–1602` | 70 | Route list plus worst-rating rollup | Overlaps `buildCwvRollups` |
| `componentBreakdown` | `DomainScreen.tsx:1618–1656` | 39 | Component-level rating from rollups | `buildCwvRollups` |

## 4. Legitimately presentational — stays

Recorded so the boundary is explicit rather than assumed.

| Area | Examples | Why it stays |
|---|---|---|
| Label and icon maps | `stack-signal-meta.ts`, `security-stack-label.ts`, runner logos | Pure display vocabulary; no repository fact is derived |
| Layout geometry | `BundleTreemap.layoutSquarify`, `overview-layout.ts`, `card-tree-layout.ts`, `file-scope.ts`, `file-tree.ts` | Pixels, not facts. Moving these to Core would make Core depend on a viewport |
| Heat and band display rules | `map-layers.ts` `dominantHeat`, `heatBand`, `layersWithoutData`, `parseLayerSignals` | Decodes a Core DTO and picks a CSS band. The values themselves come from `@repo-prism/repository-map` |
| Network adapters | ~~`github-ci.ts` fetch / PageSpeed~~ | **Superseded by ADR-0033 / M-053 §2.3** — network now goes through Core with consent; pure parse helpers in intelligence |
| Display ranking | `mostDepended`, `churn`, stack filters in `DomainScreen`; `TrendsScreen` window filters; `buildSuiteTree` | Sorting and slicing Core data for a viewport |
| Gravatar | `md5.ts`, `avatar-util.ts` | Not repository analysis |
| Query parsing | `parseLayers`, `parseZoom` in `vite.config.ts` | HTTP plumbing |
| Risk banding | `ChangeReviewScreen`, `BlastRadiusScreen` | Already reads `riskToBand` from `@repo-prism/shared` (M-051), and `risk-band-agreement.test.ts` keeps it that way |

---

## 5. Order of work

Ranked by duplicated-lines-removed per unit of risk.

1. **Test running and parsing** — the extension's copy deletes cleanly because
   Core's copy already exists, is already used by the playground, and is
   already tested.
2. **CWV parsing** — same shape: intelligence already has the better
   implementation; the surface copy is a strict subset.
3. **Overview model** — genuinely new Core surface (`getOverviewModel`), so it
   needs its own tests rather than a deletion.
4. **Rename rewriting** — small, but it is the only thing blocking a CLI
   `prism rename`.
5. **DomainScreen heuristics** — the most scattered and the least mechanical;
   do last, per module, each with a characterisation test.
