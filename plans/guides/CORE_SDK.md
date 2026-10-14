# Core SDK reference (v0.1.0)

Public integration surface for Prism. Surfaces (MCP server, CLI, plugin hooks)
must call **`@repo-prism/core` only** ([ADR-0004](../adr/0004-core-only-integration-surface.md)).

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
| `graphs` | Dependency / knowledge graphs |
| `intelligence` | DNA / stack |
| `impact` | Blast radius + safe-delete family |
| `navigation` | `findRoute` / `listLandmarks` |

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
| `getKnowledgeGraph` / `findSymbol` / `findReferences` / `searchSymbols` | `searchSymbols` is substring/regex (M-058); hard limit 50 |
| `getDna` | DNA without requiring prior index |
| `findRoute` / `listLandmarks` | M-016 |
| `getGitActivity` | Local git; fail-soft `available: false` |
| `blastRadius` | M-020; **M-049** additive soft lanes (`lane`, `confidence`, `evidence`, `lanes[]`, `hardAffectedCount` / `softAffectedCount`, `coverageNote`); optional `intent: "edit" \| "delete"`; report may include `originRole`, `forwardDependencies`, `scenarioChecklist` |
| `safeDelete` / `renameImpact` / `testImpact` | M-021; **M-049** `softBlockers` / `toolingCritical` on safe-delete |

### Experimental (may change before 1.0)

| Method | Notes |
|---|---|
| `exploreCode` | M-023 selection report |
| `getStackProfile` / `listPackages` / `selectPackage` / `getSelectedPackage` | Mono / personas |
| `startWatch` / `stopWatch` / `notifyWatchPaths` / `getIndexFreshness` | M-048 Phase 1 incremental watch (ADR-0026) |
| `.prism/config.json` (`excludeGlobs`, `maxFileBytes`) | **M-057** — loaded at workspace open; merged into every `index()` call. Precedence: explicit `IndexWorkspaceOptions` / CLI `--max-file-bytes` / `--exclude` → config file → indexer defaults (5 MiB). Helpers: `loadPrismConfig`, `writePrismConfig` (`{ ifAbsent: true }` = never clobber an existing file) |
| `reviewChanges` | M-048 Phase 4 — multi-path aggregate; **M-049** per-path `hardAffectedCount` / `softAffectedCount`; risk bands unify with Blast 60/20 (Q-023) |
| `explainArea` | M-048 Phase 5 — deterministic path summary (domain overlap + dep degree + git ownership); **M-049** optional `fileRole` |
| `prepareChange` | **M-070** — pack + reuse + House Style for a task. Paths/symbols/why only; never file bodies. `order` and `workingSet` are `null`. |
| `listFindings` / `resolveFinding` | **M-071** — queueable findings from the last index (`FindingRef`, fingerprinted). `resolveFinding` re-indexes and re-runs the finding sources; never infers resolution from a job's status. |
| `guardSession` | **M-072** — the current session (dirty files minus `preExistingChanges`, ADR-0055 G1) ranked by blast risk, each flagged for a likely duplicate, an orphaned new file, or a package boundary crossing. |
| `generateAgentsMd` / `checkAgentsMd` | **M-073** — deterministic AGENTS.md (import cycles, test locations, git ownership) written only to `~/.prism/workspaces/<key>/agents.md`, never the repo. `check` re-verifies the claims block against a fresh `getCycles()`. |


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
