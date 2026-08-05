# Core SDK reference (v0.1.0)

Public integration surface for Prism. Surfaces (MCP, CLI, VS Code, Cursor,
Playground) must call **`@repo-prism/core` only** ([ADR-0004](../adr/0004-core-only-integration-surface.md)).

Versioning / stability policy: [ADR-0019](../adr/0019-core-sdk-versioning.md).

| Constant | Value (M-025) |
|---|---|
| `PRISM_CORE_VERSION` | `0.1.0` |
| `PRISM_API_LEVEL` | `1` |

```ts
import { Prism, type PrismWorkspace } from "@repo-prism/core";

const client = Prism.create();
const opened = client.openRepository("/abs/path/to/repo");
if (!opened.ok) throw opened.error;
const ws = opened.value;
await ws.index();
```

---

## Capabilities

`PrismClient.capabilities` / `ws.status().capabilities`:

| Flag | Meaning when `true` |
|---|---|
| `indexing` | `index` / `analyze` / `getIndex` available |
| `analysis` | Analyzer plugins registered |
| `graphs` | Dependency / knowledge / feature graphs |
| `intelligence` | DNA / stack / `intelligence()` |
| `impact` | Blast radius + safe-delete family |
| `map` | `getRepositoryMap` (+ git activity for layers) |
| `navigation` | `findRoute` / `navigateFeature` / `listLandmarks` |

Default `Prism.create()` enables all of the above when default ports are wired.

---

## Stability table — `Prism` / `PrismClient`

| Member | Stability | Notes |
|---|---|---|
| `Prism.create` | stable | Primary entrypoint |
| `version` / `apiLevel` | stable | Mirror package + API level |
| `capabilities` | stable | Feature detection |
| `listLanguagePlugins` | stable | |
| `listStackDetectors` | stable | |
| `getStackProfile(absPath)` | stable | Client-level stack (no workspace) |
| `openRepository` | stable | Absolute path required |

---

## Stability table — `PrismWorkspace`

### Lifecycle & index — stable

| Method | Notes |
|---|---|
| `status` | Includes `coreVersion`, `apiLevel`, `capabilities` |
| `index` / `analyze` / `reindex` | |
| `getIndex` | `INDEX_REQUIRED` if none |
| `close` | |

### Graphs & intelligence — stable

| Method | Notes |
|---|---|
| `getDependencyGraph` / `getCycles` | |
| `getKnowledgeGraph` / `findSymbol` / `findReferences` | |
| `getFeatureGraph` / `listFeatures` | |
| `intelligence` | Aggregate report; requires index |
| `getDna` | DNA without requiring prior index |
| `getHealth` | M-015 |
| `getHealthHistory` / `getRegionMovers` | M-046 Trends history (ADR-0023) |
| `startHealthHistoryBackfill` / `getHealthHistoryBackfillStatus` | M-046 git backfill job |
| `findRoute` / `navigateFeature` / `listLandmarks` | M-016 |
| `getRepositoryMap` | M-017 |
| `getOverviewModel` | **M-052**; the Overview dashboard's aggregation — totals, coupling density + band, up to 8 regions, most-connected nodes, bucketed commit activity. Region `score` is `null` where there is no evidence, never `0` (ADR-0029). Derivations live in `@repo-prism/shared/overview-model` so the webview and Core compute identical numbers |
| `getGitActivity` | Local git; fail-soft `available: false` |
| `blastRadius` | M-020; **M-049** additive soft lanes (`lane`, `confidence`, `evidence`, `lanes[]`, `hardAffectedCount` / `softAffectedCount`, `coverageNote`); optional `intent: "edit" \| "delete"`; report may include `originRole`, `forwardDependencies`, `scenarioChecklist` |
| `safeDelete` / `renameImpact` / `testImpact` / `breakingChangeHints` | M-021; **M-049** `softBlockers` / `toolingCritical` on safe-delete |

### Experimental (may change before 1.0)

| Method | Notes |
|---|---|
| `getEngineeringHealth` | M-022 report; complementary to `getHealth` |
| `exploreCode` | M-023 selection report |
| `getBackendReport` | M-044 route intelligence |
| `getTestingReport` / `getSecurityReport` / `ingestCoverageFromWorkspace` | M-046 Testing & Security |
| `discoverFrontendRoutes` | Frontend route discovery (Next app/pages + Router) |
| `getPersonaPresets` / `getStackProfile` / `listPackages` / `selectPackage` / `getSelectedPackage` | Mono / personas |
| `startUtilityJob` / `getUtilityJob` / `listUtilityJobs` | Opt-in utilities |
| `listIngestArtifacts` / `getIngestArtifact` / `getCwvReport` | CWV / ingest |
| `detectBundleAnalyzeCapability` / `getBundleWeightReport` | Bundle Weight (M-050); Analyze via `startUtilityJob({ kind: "bundle-stats" })` |
| `listUtilityOverlayKinds` / `getUtilityOverlay` | Map domain overlays |
| `setConsent` / `getConsent` | Privacy consent |
| `startWatch` / `stopWatch` / `notifyWatchPaths` / `getIndexFreshness` | M-048 Phase 1 incremental watch (ADR-0026) |
| `reviewChanges` | M-048 Phase 4 — multi-path aggregate; **M-049** per-path `hardAffectedCount` / `softAffectedCount`; risk bands unify with Blast 60/20 (Q-023) |
| `explainArea` | M-048 Phase 5 — deterministic path summary (domain overlap + dep degree + git ownership); **M-049** optional `fileRole` |
| `listBookmarks` / `saveBookmark` / `removeBookmark` | M-048 Phase 6 — bookmarks persisted at `.prism/bookmarks.json` |

### Top-level functions (not on `PrismWorkspace`) — experimental

These take an explicit workspace root instead of a session. They exist because
they act on the filesystem or the network rather than on an index snapshot.

| Function | Notes |
|---|---|
| `stageDevopsRemote(input)` | Fetches DevOps files from GitHub into `.prism/remote-ci/<owner>/<repo>/` and optionally builds an IaC overlay. **Network-gated: `input.consentGranted` must be `true`** or the call is refused before any request is made (ADR-0024, M-051). Returns `{ ok, value } \| { ok: false, error: string }` — a plain shape, not `Result<T, PrismError>`. |
| `listLocalWorkspaceTests(root, runners)` | Discovers test files via `vitest list --json` or `jest --listTests`. Returns `LocalTestListResult`; empty (never throws) when no runner is available. |
| `runLocalWorkspaceTests(root, runners, options?)` | Runs tests, preferring package.json `scripts.test`, then vitest/jest. `options` carries `coverage`, `path`, `testNamePattern`. Returns `LocalRunTestsResult` with `ran: false` when nothing could run. |

`runners` comes from the detected stack (`getStackProfile`). These three
functions spawn subprocesses or reach the network, so they are deliberately not
part of the workspace façade — a caller has to opt into them by name.

### Internal (do not use from surfaces)

| Symbol | Notes |
|---|---|
| `createWorkspace` | Prefer `Prism.create` → `openRepository` |
| `*Port` types / `PrismEnginePorts` | Test / advanced injection only |

---

## Result convention

All fallible APIs return `Result<T, PrismError>` from `@repo-prism/shared` (also
re-exported by `@repo-prism/core`). Prefer checking `.ok` over try/catch.

Common codes: `PRISM_WORKSPACE_NOT_OPEN`, `PRISM_INDEX_REQUIRED`,
`PRISM_VALIDATION`, `PRISM_UNSUPPORTED`.

---

## Related guides

- [Intelligence API](./INTELLIGENCE_API.md)
- [Utility overlays](./UTILITY_OVERLAYS.md)
- Package README: [`packages/core/README.md`](../../packages/core/README.md)
