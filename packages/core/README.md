# @prism/core

**Public SDK façade.** MCP, CLI, VS Code, Cursor, and Playground must integrate **only** through this package. Engine packages are internal; Core wires them via ports.

See [ADR-0004](../../plans/adr/0004-core-only-integration-surface.md).

## Install (workspace)

```ts
import { Prism } from "@prism/core";
```

## Lifecycle

```ts
const prism = Prism.create();

const opened = prism.openRepository("/absolute/path/to/repo");
if (!opened.ok) throw opened.error;

const ws = opened.value;
const indexed = await ws.analyze(); // stub empty IndexSummary until indexer lands
if (!indexed.ok) throw indexed.error;

console.log(ws.status()); // open, capabilities, version, lastIndexedAt
ws.close();
```

## Public surface (M-003)

| API | Role |
|---|---|
| `Prism.create(options?)` | Construct client; optional `capabilities` / `ports` |
| `client.openRepository(absPath)` | `Result<PrismWorkspace>` — absolute path required |
| `ws.analyze()` / `ws.reindex()` | Stub empty `IndexSummary`, or delegate to `IndexerPort` |
| `ws.getDna()` / `ws.getHealth()` / `ws.blastRadius(...)` | `UNSUPPORTED` until later milestones |
| `ws.status()` / `ws.close()` | Lifecycle metadata |
| `PRISM_CORE_VERSION` / `PRISM_API_LEVEL` | Version metadata |
| `STUB_CAPABILITIES` / `PrismCapabilities` | Feature flags (all false in skeleton) |
| `AnalyzerPort` / `IndexerPort` / `GraphEnginePort` | Interface-only engine wiring |

## Rules

- Surfaces **never** import `@prism/indexer`, `@prism/analyzer`, etc. directly.
- Prefer `Result` + `PrismError` from `@prism/shared` over thrown strings.
- No network I/O in Core analysis paths.

**Implemented:** M-003  
**Depends on:** `@prism/shared` (engines composed later)
