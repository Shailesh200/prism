# @prism/indexer

Workspace walk, ignore rules, content hashing, and repository index jobs.

**Implemented:** M-005 (inventory), M-007 (IndexJob → `IndexSnapshot`)  
**Next:** M-008 SQLite persistence  
**Depends on:** `@prism/shared`, `@prism/analyzer`  
**Surfaces:** must call via `@prism/core` only (ADR-0004)

## Index job (M-007)

```ts
import { runIndexJob } from "@prism/indexer";

const result = await runIndexJob("/absolute/path/to/repo", {
  concurrency: 4,
  onProgress: (e) => console.log(e.phase, e.filesDone, e.path),
  signal: AbortSignal.timeout(30_000),
});
```

Pipeline: **inventory → language detect → parse/extract → `IndexSnapshot`**.  
Per-file analyze failures are recorded (`status: "failed"`) and do **not** fail the job.

Core façade:

```ts
const ws = Prism.create().openRepository(root).value;
await ws.index();
const snap = ws.getIndex();
```

## Inventory API

```ts
import { inventoryWorkspace } from "@prism/indexer";

const result = await inventoryWorkspace("/absolute/path/to/repo");
```

## Ignore rules (applied in order)

1. Built-ins (`node_modules/`, `.git/`, `.prism/`, common binaries, …)
2. Root `.gitignore`
3. Root `.prismignore`
4. Optional `extraIgnorePatterns`

## Policies

| Policy | Behavior |
|---|---|
| Hash | SHA-256 hex (`hashAlgo: "sha256"`) |
| Binary | NUL sniff → `skipped_binary` |
| Oversized | Default > 5 MiB → `skipped_oversized` |
| Unsupported ext | `skipped_unsupported` (no language plugin) |
| Analyze error | `failed` + warning; job continues |

## Timing note (M-007 fixture)

`fixtures/m007-mini` (4 files): warm `runIndexJob` typically **&lt; 50 ms** on a developer Mac (not a CI gate).

## See also

- [ADR-0006](../../plans/adr/0006-content-hash-sha256.md) — hash algorithm
- Golden fixture: `fixtures/m007-mini/`
