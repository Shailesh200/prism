# @prism/core

**Public SDK façade.** MCP, CLI, VS Code, Cursor, and Playground must integrate **only** through this package. Engine packages are internal; Core wires them via ports.

See [ADR-0004](../../plans/adr/0004-core-only-integration-surface.md) · [ADR-0007](../../plans/adr/0007-stack-detector-spi.md).

## Install (workspace)

```ts
import { Prism } from "@prism/core";
```

## Lifecycle

```ts
const prism = Prism.create();

console.log(prism.listLanguagePlugins()); // default: noop (M-004)
console.log(prism.listStackDetectors()); // unknown + nodejs-manifest (M-040)

const stack = await prism.getStackProfile("/absolute/path/to/repo");
if (stack.ok) console.log(stack.value.summary);

const opened = prism.openRepository("/absolute/path/to/repo");
if (!opened.ok) throw opened.error;

const ws = opened.value;
const indexed = await ws.analyze(); // stub empty IndexSummary until indexer lands
if (!indexed.ok) throw indexed.error;

console.log(ws.status());
ws.close();
```

## Public surface

| API | Role |
|---|---|
| `Prism.create(options?)` | Construct client; optional `capabilities` / `ports` |
| `client.listLanguagePlugins()` | Analyzer host plugins |
| `client.listStackDetectors()` | Stack detector descriptors (M-040) |
| `client.getStackProfile(absPath)` | Stub `StackProfile` (rich packs in M-013) |
| `client.openRepository(absPath)` | `Result<PrismWorkspace>` — absolute path required |
| `ws.analyze()` / `ws.reindex()` | Stub empty `IndexSummary`, or delegate to `IndexerPort` |
| `ws.getDna()` / `ws.getHealth()` / `ws.blastRadius(...)` | `UNSUPPORTED` until later milestones |
| `ws.status()` / `ws.close()` | Lifecycle metadata |

## Rules

- Surfaces **never** import engine packages directly.
- Prefer `Result` + `PrismError` from `@prism/shared` over thrown strings.
- No network I/O in Core analysis paths.

**Implemented:** M-003–M-004, M-040 (stack wiring)  
**Depends on:** `@prism/shared`, `@prism/analyzer`, `@prism/intelligence`
