# @prism/core

**Public SDK façade.** MCP, CLI, VS Code, Cursor, and Playground must integrate **only** through this package. Engine packages are internal; Core wires them via ports.

See [ADR-0004](../../plans/adr/0004-core-only-integration-surface.md) · [ADR-0007](../../plans/adr/0007-stack-detector-spi.md) · [Intelligence API guide](../../plans/guides/INTELLIGENCE_API.md).

## Install (workspace)

```ts
import { Prism } from "@prism/core";
```

## Lifecycle

```ts
const prism = Prism.create();

console.log(prism.listLanguagePlugins());
console.log(prism.listStackDetectors());

const stack = await prism.getStackProfile("/absolute/path/to/repo");
if (stack.ok) console.log(stack.value.summary);

const opened = prism.openRepository("/absolute/path/to/repo");
if (!opened.ok) throw opened.error;

const ws = opened.value;
const indexed = await ws.index();
if (!indexed.ok) throw indexed.error;

const intel = await ws.intelligence();
if (!intel.ok) throw intel.error;
console.log(intel.value.dna.summary);
console.log(intel.value.consistency.ok);

ws.close();
```

## Intelligence API (M-014)

Primary aggregate for surfaces:

| API | Role |
|---|---|
| `ws.intelligence()` | `IntelligenceReport` — DNA + dependency/knowledge/feature graphs + consistency + capabilities |
| `ws.getDna()` | DNA only (no index required) |
| `ws.getDependencyGraph()` / `getCycles()` | Dependency graph |
| `ws.getKnowledgeGraph()` / `findSymbol` / `findReferences` | Semantic KG |
| `ws.getFeatureGraph()` / `listFeatures()` | Feature graph |

Full guide: [`plans/guides/INTELLIGENCE_API.md`](../../plans/guides/INTELLIGENCE_API.md).

## Public surface

| API | Role |
|---|---|
| `Prism.create(options?)` | Construct client; optional `capabilities` / `ports` |
| `client.listLanguagePlugins()` | Analyzer host plugins |
| `client.listStackDetectors()` | Stack detector descriptors |
| `client.getStackProfile(absPath)` | `StackProfile` from detector packs |
| `client.openRepository(absPath)` | `Result<PrismWorkspace>` — absolute path required |
| `ws.index()` / `ws.getIndex()` | Full index snapshot |
| `ws.analyze()` / `ws.reindex()` | Index summary |
| `ws.intelligence()` | Aggregate intelligence report (requires index) |
| `ws.getHealth()` | Health score 0–100 + factors (M-015; requires index) |
| `ws.findRoute()` / `navigateFeature()` / `listLandmarks()` | Navigation (M-016; requires index) |
| `ws.blastRadius(...)` | Later milestones |
| `ws.status()` / `ws.close()` | Lifecycle metadata |

## Rules

- Surfaces **never** import engine packages directly.
- Prefer `Result` + `PrismError` from `@prism/shared` over thrown strings.
- No network I/O in Core analysis paths.

**Implemented:** M-003–M-014 (Core façade through Intelligence API)  
**Depends on:** `@prism/shared`, `@prism/analyzer`, `@prism/indexer`, `@prism/intelligence`
