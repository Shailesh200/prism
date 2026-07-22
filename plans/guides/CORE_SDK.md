# Core SDK reference (v0.1.0)

Public integration surface for Prism. Surfaces (MCP, CLI, VS Code, Cursor,
Playground) must call **`@prism/core` only** ([ADR-0004](../adr/0004-core-only-integration-surface.md)).

Versioning / stability policy: [ADR-0019](../adr/0019-core-sdk-versioning.md).

| Constant | Value (M-025) |
|---|---|
| `PRISM_CORE_VERSION` | `0.1.0` |
| `PRISM_API_LEVEL` | `1` |

```ts
import { Prism, type PrismWorkspace } from "@prism/core";

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
| `findRoute` / `navigateFeature` / `listLandmarks` | M-016 |
| `getRepositoryMap` | M-017 |
| `getGitActivity` | Local git; fail-soft `available: false` |
| `blastRadius` | M-020 |
| `safeDelete` / `renameImpact` / `testImpact` / `breakingChangeHints` | M-021 |

### Experimental (may change before 1.0)

| Method | Notes |
|---|---|
| `getEngineeringHealth` | M-022 report; complementary to `getHealth` |
| `exploreCode` | M-023 selection report |
| `getBackendReport` | M-044 route intelligence |
| `getPersonaPresets` / `getStackProfile` / `listPackages` / `selectPackage` / `getSelectedPackage` | Mono / personas |
| `startUtilityJob` / `getUtilityJob` / `listUtilityJobs` | Opt-in utilities |
| `listIngestArtifacts` / `getIngestArtifact` / `getCwvReport` | CWV / ingest |
| `listUtilityOverlayKinds` / `getUtilityOverlay` | Map domain overlays |
| `setConsent` / `getConsent` | Privacy consent |

### Internal (do not use from surfaces)

| Symbol | Notes |
|---|---|
| `createWorkspace` | Prefer `Prism.create` → `openRepository` |
| `*Port` types / `PrismEnginePorts` | Test / advanced injection only |

---

## Result convention

All fallible APIs return `Result<T, PrismError>` from `@prism/shared` (also
re-exported by `@prism/core`). Prefer checking `.ok` over try/catch.

Common codes: `PRISM_WORKSPACE_NOT_OPEN`, `PRISM_INDEX_REQUIRED`,
`PRISM_VALIDATION`, `PRISM_UNSUPPORTED`.

---

## Related guides

- [Intelligence API](./INTELLIGENCE_API.md)
- [Utility overlays](./UTILITY_OVERLAYS.md)
- Package README: [`packages/core/README.md`](../../packages/core/README.md)
