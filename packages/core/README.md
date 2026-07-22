# @prism/core

**Public SDK façade (v0.1.0).** MCP, CLI, VS Code, Cursor, and Playground must
integrate **only** through this package. Engine packages are internal.

- [ADR-0004](../../plans/adr/0004-core-only-integration-surface.md) — Core-only
- [ADR-0019](../../plans/adr/0019-core-sdk-versioning.md) — versioning / freeze
- [Core SDK reference](../../plans/guides/CORE_SDK.md) — stability table
- [CHANGELOG](./CHANGELOG.md)

## Install (workspace)

```ts
import { Prism, ok, type HealthScore } from "@prism/core";
```

## Lifecycle

```ts
const prism = Prism.create();
// prism.version === "0.1.0"; prism.apiLevel === 1

const opened = prism.openRepository("/absolute/path/to/repo");
if (!opened.ok) throw opened.error;

const ws = opened.value;
const indexed = await ws.index();
if (!indexed.ok) throw indexed.error;

const health = await ws.getHealth();
if (health.ok) console.log(health.value.score, health.value.grade);

const map = ws.getRepositoryMap({ zoom: "package" });
if (map.ok) console.log(map.value.nodes.length);

ws.close();
```

## Stable highlights

| API | Role |
|---|---|
| `Prism.create()` | Client + default ports / capabilities |
| `openRepository` | Workspace handle |
| `index` / `analyze` / `reindex` | Index lifecycle |
| `intelligence` / `getDna` / `getHealth` | Intelligence + health |
| `getDependencyGraph` / KG / features | Graphs |
| `findRoute` / `listLandmarks` | Navigation |
| `getRepositoryMap` / `getGitActivity` | Map + local git |
| `blastRadius` / `safeDelete` / … | Impact |

**Experimental** (may change before 1.0): `getEngineeringHealth`, `exploreCode`,
`getBackendReport`, utility overlays / jobs, mono package selection — see
[CORE_SDK.md](../../plans/guides/CORE_SDK.md).

## Rules

- Surfaces **never** import engine packages directly.
- Prefer `Result` + `PrismError` (re-exported from Core) over thrown strings.
- No network I/O in Core analysis paths.
- Breaking **stable** APIs after this freeze: ADR + `PRISM_API_LEVEL` bump.

**Depends on:** `@prism/shared`, analyzer, indexer, intelligence, navigation,
repository-map, impact
