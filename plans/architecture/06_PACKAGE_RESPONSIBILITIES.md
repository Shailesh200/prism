# Prism — Package Responsibilities

| Field | Value |
|---|---|
| Status | Draft (M-000) |
| Rule | Surfaces → **Core only**; engines do not import surfaces |

---

## 1. Dependency matrix (allowed)

| Package | May depend on |
|---|---|
| `shared` | — |
| `analyzer` | `shared` |
| `indexer` | `shared`, `analyzer` |
| `graph-engine` | `shared` |
| `intelligence` | `shared`, `graph-engine`, `indexer` (read APIs) |
| `impact` | `shared`, `graph-engine`, `analyzer` |
| `navigation` | `shared`, `graph-engine` |
| `repository-map` | `shared`, `graph-engine`, `navigation` |
| `core` | all engine packages + `shared` |
| `ui` | `shared` (+ map DTOs; not engines) |
| `mcp-server` | `core`, `shared`, `dispatch` |
| `dispatch` | `shared` |
| `cli` | `core`, `shared` |
| `vscode-extension` | `core`, `ui`, `shared` |
| `cursor-extension` | `core`, `ui`, `shared` (thin overlay) |

Anything not listed is **forbidden** without an ADR.

---

## 2. Per-package RACI-style map

### `@repo-prism/shared`

| Owns | Must not contain |
|---|---|
| DTOs, Zod schemas, IDs, Result/AppError, constants | Parsing, graphs, FS I/O, React |

### `@repo-prism/analyzer`

| Owns | Must not contain |
|---|---|
| Language SPI, Oxc (v1) plugin, extract symbols/imports/exports | Index orchestration, SQLite, MCP |

### `@repo-prism/indexer`

| Owns | Must not contain |
|---|---|
| Walk, ignore, hashing, index jobs, coordinating persist | UI, blast-radius product logic |

### `@repo-prism/graph-engine`

| Owns | Must not contain |
|---|---|
| ngraph store, typed edges, query primitives | Language parsing, IDE chrome |

### `@repo-prism/intelligence`

| Owns | Must not contain |
|---|---|
| DNA, detection, health, insights, entropy | Map rendering, MCP protocol |

### `@repo-prism/impact`

| Owns | Must not contain |
|---|---|
| Blast radius, safe delete/rename/test impact reports | Extension commands, CLI argv parsing |

### `@repo-prism/navigation`

| Owns | Must not contain |
|---|---|
| Routes / path finding across features & symbols | React Flow, SQLite schema |

### `@repo-prism/repository-map`

| Owns | Must not contain |
|---|---|
| Map model, layers, zoom levels, landmarks, bookmarks | Direct Oxc calls, MCP SDK |

### `@repo-prism/core`

| Owns | Must not contain |
|---|---|
| Stable public SDK composing engines; workspace lifecycle | Duplicate algorithms already in engines; UI components |

### `@repo-prism/ui`

| Owns | Must not contain |
|---|---|
| React Map, inspector shells, Signal Chart components | Calling `analyzer` / `indexer` directly |

### `@repo-prism/mcp-server`

| Owns | Must not contain |
|---|---|
| MCP transport, Intelligence tools via Core, Dispatch tools via `@repo-prism/dispatch` | Second copy of impact/graph logic |

### `@repo-prism/dispatch`

| Owns | Must not contain |
|---|---|
| Jobs, memories, host-connector discovery, worktree adopt/create, local workers | Indexer/SQLite, Core analysis APIs, any network call |

### `@repo-prism/cli`

| Owns | Must not contain |
|---|---|
| Commander commands, stdout/JSON formatting via Core | Hidden analysis bypassing Core |

### `@repo-prism/vscode-extension`

| Owns | Must not contain |
|---|---|
| Activation, commands, webview host, wiring Core + UI | Reimplementing index/graphs |

### `@repo-prism/cursor-extension`

| Owns | Must not contain |
|---|---|
| Cursor packaging / branding overlay (prefer shared with VS Code) | Forked Core |

---

## 3. Apps

| App | Owns | Must not |
|---|---|---|
| `apps/playground` | Interactive demos of Map + Core | Become the production extension |
| `apps/website` | Public site, docs | Core analysis |
| `apps/docs` | Human docs site (M-038 tooling) | Replace `plans/` as engineering SoT |

---

## 4. Quick compliance test

Before merging a PR, ask:

1. Does a surface import an **engine** package? → **Fail**. `mcp-server` may import `dispatch` in addition to `core` / `shared` (ADR-0035).
2. Does an engine import `mcp-server`, `cli`, or an extension? → **Fail**
3. Is new stack tech introduced without ADR? → **Fail**
4. Does analysis require network? → **Fail** (unless explicit post-GA feature + ADR)
