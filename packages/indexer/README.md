# @prism/indexer

Workspace walk, ignore rules, content hashing, and (later) index orchestration / SQLite.

**Implemented:** M-005 (fs / ignore / hash inventory)  
**Next:** M-007 index jobs, M-008 SQLite  
**Depends on:** `@prism/shared`  
**Surfaces:** must call via `@prism/core` only (ADR-0004)

## Inventory API

```ts
import { inventoryWorkspace } from "@prism/indexer";

const result = await inventoryWorkspace("/absolute/path/to/repo");
if (!result.ok) throw result.error;

// Deterministic path order; SHA-256 hex digests (ADR-0006)
for (const file of result.value.files) {
  console.log(file.path, file.status, file.contentHash);
}
```

## Ignore rules (applied in order)

1. Built-ins (`node_modules/`, `.git/`, `.prism/`, common binaries, …)
2. Root `.gitignore` (gitignore syntax)
3. Root `.prismignore`
4. Optional `extraIgnorePatterns` on the API

Nested `.gitignore` files are **not** loaded in M-005 (root-scoped). Windows path quirks: inventory normalizes to POSIX repo-relative paths; CI coverage for case-insensitive FS is deferred (Q-011).

## Policies

| Policy | Behavior |
|---|---|
| Hash | SHA-256 hex (`hashAlgo: "sha256"`) |
| Binary | NUL sniff in first 8 KiB → `skipped_binary` |
| Oversized | Default > 5 MiB → `skipped_oversized` |
| Ignored | Omitted from `files` (counted in `stats.filesIgnored`) |

## See also

- [ADR-0006](../../plans/adr/0006-content-hash-sha256.md) — hash algorithm
- Tests build a disposable fixture via `createM005Fixture()` (temp dir)
