# Intelligence API guide

Stable Core façade for repository understanding (M-014). Surfaces (MCP, CLI, IDE) should prefer `workspace.intelligence()` when they need DNA + graphs together.

## Entry point

```ts
import { Prism } from "@repo-prism/core";
import { IntelligenceReportSchema } from "@repo-prism/shared";

const prism = Prism.create();
const opened = prism.openRepository("/absolute/path/to/repo");
if (!opened.ok) throw opened.error;

const ws = opened.value;
const indexed = await ws.index();
if (!indexed.ok) throw indexed.error;

const report = await ws.intelligence();
if (!report.ok) throw report.error;

IntelligenceReportSchema.parse(report.value);
console.log(report.value.dna.summary);
console.log(report.value.consistency.ok);
console.log(report.value.features.map((f) => f.slug));
```

`intelligence()` requires a prior `index()` (`INDEX_REQUIRED` otherwise). DNA alone remains available via `getDna()` without an index.

## `IntelligenceReport` fields

| Field | Source |
|---|---|
| `summary` | Index summary (stats, warnings) |
| `dna` | Stack detectors + assembler (M-013) |
| `dependencyGraph` | Import/re-export graph (M-010) |
| `knowledgeGraph` + `knowledgeStats` | Symbol KG (M-011) |
| `featureGraph` + `features` | Feature inference (M-012) |
| `consistency` | File nodes / feature members ⊆ indexed paths |
| `capabilities` | Snapshot of Core capability flags |

## Consistency

`consistency.ok === false` does **not** fail the `Result`. Issues use code `GRAPH_FILE_NOT_INDEXED` with `graph` ∈ `dependency` \| `knowledge` \| `feature`. Surfaces may warn or hide overlays when not ok.

## Granular APIs (still supported)

Use when you only need one slice:

- `getDna()`, `getStackProfile(absPath)`
- `getDependencyGraph()` / `getCycles()`
- `getKnowledgeGraph()` / `findSymbol()` / `findReferences()`
- `getFeatureGraph()` / `listFeatures()`
- `getIndex()` / `analyze()`

## Out of scope here

- Health score formula → M-015  
- MCP tool exposure → M-026+  
- Stack utilities epic → M-041 (unblocked by this API)
