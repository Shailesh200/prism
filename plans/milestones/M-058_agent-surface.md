# M-058 — Agent Surface v2 (MCP Hero)

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-058-agent-surface` (from latest `main`) |
| Depends on | M-057 |
| Unlocks | M-059 |
| Packages | `@repo-prism/mcp-server`, `@repo-prism/core`, `@repo-prism/shared`, `@repo-prism/intelligence` |
| Amends | [ADR-0030](../adr/0030-mcp-transport-and-lifecycle.md) (tool envelope, resources) |

## 1. Goal

The MCP pack is the best structural-intelligence pack an agent can install. Every tool is bounded,
actionable, and honest about what it cannot do — so an agent can orient and review a change using
at most five bounded calls without drowning in pretty-printed JSON.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-C1** | `review_diff` prompt promises what the tool rejects — [`prompts.ts:92-94`](../../packages/mcp-server/src/prompts.ts) vs [`impact.ts:159-163`](../../packages/mcp-server/src/tools/impact.ts). | New `changed_paths` tool wrapping `getChangedPaths`; `review_changes.paths` becomes optional — omitted means auto-discover (with optional `base`); prompt rewritten to the real flow. Contract tests. |
| **P-C2** | Unbounded graph dumps. | MCP `repository_map` passes `zoom: "package"` when omitted; `dependency_graph` and `feature_graph` gain the standard `limit` envelope (default 50, max 500) plus a `summaryOnly` mode (counts + top-degree nodes); `knowledge_graph` stays but requires `path` or `limit` (locked). Contract tests assert the envelope. |
| **P-C3** | `explore_code` returns every reference in a file. | Apply the bounded-list envelope to usages (default 50). |
| **P-C4** | Pretty-printed JSON tax — [`tool-registry.ts:105-107`](../../packages/mcp-server/src/tool-registry.ts). | Compact `JSON.stringify(value ?? null)`; `PRISM_MCP_PRETTY=1` opt-in. Update contract tests. |
| **P-C5** | `blast_radius` uncapped at MCP. | `limit` on the impact tools over `affectedFiles`/tests with the standard envelope. |
| **P-C6** | No status tool. | `workspace_status` returning workspace path, indexed flag, indexedAt, freshness, git availability, cache presence, node/edge counts. |
| **P-C7** | `PRISM_INDEX_REQUIRED` is not actionable for an agent. | The MCP error mapper rewrites it to "Index not ready yet — retry in a few seconds". |
| **P-C8** | No MCP resources. | Register `prism://dna`, `prism://landmarks`, `prism://health`, refreshed after index; add the resources capability. |
| **P-C9** | Overlapping tools. | Mark `breaking_change_hints` deprecated in its description ("included in blast_radius"); `explain_area` description points to `explore_code` for file targets. No removals. |
| **P-C10** | `find_symbol` is exact-match only — [`semantic/build.ts:399`](../../packages/intelligence/src/semantic/build.ts). | `search_symbols` tool — substring/regex, optional kind filter, hard limit 50; additive Core query extension. |
| **P-C11** | Agents cannot tell "not supported" from "not consented". | `capabilities` tool listing every Core capability with availability and the reason for anything unavailable. |
| **P-C12** | No CI story for MCP users. | MCP README section — CLI for gates, MCP for queries. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Removing any shipped MCP tool | Locked — deprecate only |
| Reference precision (homonyms, member calls) | M-059 Reference Precision |
| Official GitHub Action | M-060 CI and PR Integration |
| One-click MCP install on website | M-063 Distribution |

## 4. Definition of Done

- [ ] M-057 Verified and merged; this branch cut from updated `main`
- [ ] Only one milestone `In Progress`
- [ ] P-C1 through P-C12 implemented; contract tests green
- [ ] A recorded agent session orients and reviews a change using at most 5 bounded calls
- [ ] No tool removed; `knowledge_graph` requires `path` or `limit`
- [ ] `bun run verify:milestone` green
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- Prism Completion Program (owner plan, 2026-08-08) — Phase 3
- [M-026 MCP Server Foundation](./M-026_mcp-server.md) · [M-027 MCP Tools Pack](./M-027_mcp-tools-pack.md)
- [ADR-0030](../adr/0030-mcp-transport-and-lifecycle.md) MCP transport and lifecycle
- [ADR-0024](../adr/0024-opt-in-network-integrations.md) consent
