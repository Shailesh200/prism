# `@repo-prism/shared`

Canonical TypeScript contracts for Prism: `Result`, `PrismError`, branded IDs, repo-relative paths, and Zod DTOs for MCP/CLI.

> Surfaces and engines must share these types — do not redefine errors/IDs elsewhere.

## Exports

| Area | Module |
|---|---|
| Result | `Result`, `ok`, `err`, `isOk`, `isErr`, `mapResult`, `unwrap` |
| Errors | `PrismError`, `PrismErrorCode`, `prismError` |
| IDs | `RepoId`, `FileId`, `SymbolId`, `NodeId`, `EdgeId`, `FeatureId` + `as*` parsers |
| Paths | `normalizeRepoPath`, `joinRepoPath`, `RepoRelativePath` |
| DTOs | `IndexSummary`, `HealthScore`, `BlastRadiusReport`, `DnaReport`, `FileInventory`, `StackProfile` + Zod schemas |
| Stack | `StackDomain`, `DeveloperPersona` well-known ids (open registry) |

## Error codes (`PrismErrorCode`)

| Code | When |
|---|---|
| `PRISM_UNKNOWN` | Unexpected failure |
| `PRISM_VALIDATION` | Input / schema validation failed |
| `PRISM_NOT_FOUND` | Entity missing |
| `PRISM_INVALID_PATH` | Bad workspace-relative path |
| `PRISM_INVALID_ID` | Bad branded id |
| `PRISM_WORKSPACE_NOT_OPEN` | Core called without open workspace |
| `PRISM_INDEX_REQUIRED` | Operation needs a fresh index |
| `PRISM_INDEX_FAILED` | Indexing failed |
| `PRISM_ANALYZER_FAILED` | Language plugin / parse failed |
| `PRISM_GRAPH_ERROR` | Graph store / query failed |
| `PRISM_IO_ERROR` | Filesystem / SQLite I/O |
| `PRISM_UNSUPPORTED` | Feature not available |
| `PRISM_CANCELLED` | User / host cancelled a job |

DTO `PrismError` is JSON-serializable (`code`, `message`, optional `details`). No Node `Error` stacks on the wire.

## Path rules

Public contracts use **workspace-relative POSIX** paths: `/` separators, no leading `/`, no `..`.

## Milestone

Introduced in **M-002**. Rename error codes only via ADR.
