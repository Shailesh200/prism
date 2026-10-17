# M-069 — recorded MCP session (≤5 calls)

| Field | Value |
|---|---|
| Date | 2026-09-11 |
| Workspace | `~/Prism` |
| Bound | Each list tool returns `{ items, totalCount, truncated, limit }` |

## Sequence

Recorded 2026-09-11 against this checkout. The **Cursor-connected** Prism MCP
process is still the published 1.11.1 server (T0 lie). The **this-branch**
Core/MCP implementation is honest. Reload the prism MCP server after merge
for the host process to match.

### 1. `workspace_status`

Host MCP: `indexed: true`, `freshness.status: "fresh"`,
`indexedAt: 2026-09-11T10:37:13.435Z`, `gitAvailable: true`.

### 2. `search_symbols` `{ pattern: "e", limit: 50 }`

| Probe | items | totalCount | truncated | limit |
|---|---|---|---|---|
| Host MCP (published, this chat) | 50 | **50** | **false** | 50 |
| This branch Core (after `index()`) | 50 | **6516** | **true** | 50 |
| Fixture KG (60 names containing `e`) | 50 | **60** | **true** | 50 |

First host hit: `bandLabel` in `action/render-comment.mjs` (same as this-branch
sample).

### 3. `find_symbol` `{ name: "bandLabel" }`

Host MCP: `items.length === 1`, `totalCount: 1`, `truncated: false`. Narrower
than raising `search_symbols` limit.

### 4. `review_changes` (paths omitted)

Host MCP: `PRISM_NOT_FOUND: File not found in index: packages/dispatch/fixtures/verify-go/go.mod`.
The dirty set includes M-069 fixtures that the **stale** host index does not
contain. `blast_radius` not called.

This-branch proof: `bun scripts/agent-native-proof.ts --tag M-069 --expect-honest`
wrote `plans/notes/proof/M-069.json`.

Tools used exist on `main` (M-058) and stay bounded. No tool removed.
