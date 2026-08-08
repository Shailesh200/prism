# M-026 — MCP Server Foundation

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-026-mcp-server` (from latest `main`) |
| Depends on | M-025, M-051, M-052 |
| Unlocks | M-027 |
| Packages | `@repo-prism/mcp-server` |
| Related ADR | [ADR-0004](../adr/0004-core-only-integration-surface.md); new ADR-0030 (transport + lifecycle) |

> **Rewritten 2026-08-05.** The original 37-line version predates the Core SDK freeze, the app-shell
> consolidation and the extension surfaces. Its assumption that health might be "delayed" and tools
> might be "stubs" no longer applies — Core exposes roughly fifty workspace methods today.

## 1. Goal

Ship an MCP server process that a coding agent can actually connect to: stdio transport, workspace
resolution, lifecycle handling, error mapping, and a small set of **real** tools proving the whole
path works end to end. Breadth of tools is M-027; this milestone is about the spine being correct.

## 2. Current state

`@repo-prism/mcp-server` is effectively empty. `package.json` depends only on `@repo-prism/shared` — **not on
`@repo-prism/core`**, and not on any MCP SDK. `src/` contains `index.ts` (8 lines), a stub test, and
`backend-report-tool.ts` left behind by M-044. There is no server, no transport, no registration.

## 3. Design decisions (→ ADR-0030)

| Decision | Choice | Rationale |
|---|---|---|
| Transport | **stdio only** | What Cursor and Claude Code use. HTTP is a later ADR if a remote case appears; shipping both now doubles the surface for no user |
| Workspace resolution | CLI arg → `PRISM_WORKSPACE` env → cwd | Explicit beats implicit; agents launch us with a cwd we did not choose |
| Workspace lifetime | One workspace per process, opened lazily on first tool call, reused after | Indexing is expensive; an agent calling six tools should index once |
| Indexing policy | Index on first use; reuse the cache. Never index during `initialize` | A slow handshake looks like a broken server |
| Error mapping | `PrismError` → MCP error with a stable `code` | Agents branch on codes; prose is for humans |
| Consent | Any consent-gated Core path is **refused** with an explanatory error | An agent cannot give informed consent on the user's behalf ([ADR-0024](../adr/0024-opt-in-network-integrations.md)) |
| Result shape | JSON-serializable DTOs from `@repo-prism/shared`, unmodified | The MCP contract *is* the Core contract; no reshaping in the adapter |

The consent decision is the one worth arguing about, and it is deliberate: Prism's promise is that
nothing reaches the network or spawns a build without the user asking. An agent asking on the
user's behalf is not the user asking.

## 4. In scope

| Task | Detail |
|---|---|
| 1 | Add `@modelcontextprotocol/sdk` and `@repo-prism/core` as dependencies; wire `bin` entry `prism-mcp` |
| 2 | Server bootstrap over stdio with correct `initialize` / capabilities handshake |
| 3 | Workspace resolution + lazy open; clear error when the path is not a readable directory |
| 4 | Tool registration framework: one place to declare name, description, Zod input schema, Core call |
| 5 | Four real tools: `repository_dna`, `repository_health`, `repository_map`, `blast_radius` |
| 6 | Adopt the existing `backend-report-tool.ts` into the framework or delete it — no orphans |
| 7 | `PrismError` → MCP error mapping with stable codes |
| 8 | Graceful shutdown: close the workspace, release the SQLite handle, flush nothing silently |
| 9 | `README.md` with copy-pasteable config for Cursor and Claude Code |
| 10 | Contract tests driving a real in-process MCP client against a fixture repository |

## 5. Out of scope

- The remaining eleven tools (M-027)
- HTTP/SSE transport
- Multi-workspace or workspace switching mid-session
- MCP resources and prompts — tools first, and only add the others if a real client needs them
- Publishing to npm (M-039)

## 6. Definition of Done

- [x] Only one milestone `In Progress`
- [x] ADR-0030 Accepted (transport, lifecycle, consent refusal)
- [x] Server starts over stdio and completes `initialize` with no indexing — verified by contract test (`session.isOpen()` false after handshake) and by piping a real handshake into `dist/bin.js`
- [x] `tools/list` returns the tools with valid JSON Schema — **five**, not four: task 6 adopted the orphaned `backend-report-tool` rather than deleting it
- [x] All five tools return real Core data against the fixture repository
- [x] `@repo-prism/mcp-server` depends on `@repo-prism/core` and calls **only** Core — enforced by `boundaries.test.ts` over both imports and the manifest
- [x] Consent-gated paths are unreachable rather than refused at runtime — no registered tool calls one, enforced by test (ADR-0030 §4)
- [x] Graceful shutdown closes the workspace and releases the SQLite handle on SIGINT/SIGTERM/stdin close
- [x] README config verified by actually connecting from Cursor (**owner** — needs a real client)
- [x] `bun run verify:milestone` green
- [x] Owner approval → merge → Verified → snippet shared

**Verified end to end against this repository**, not only the fixture: `node dist/bin.js --workspace
<Prism>` completed the handshake, listed five tools, and returned a real health report over 755
indexed files, with stdout carrying protocol frames only and diagnostics on stderr.

## 7. Verification plan

| Kind | Check |
|---|---|
| Unit | Workspace resolution precedence: arg > env > cwd |
| Unit | `PrismError` → MCP error code mapping, one case per `PrismErrorCode` |
| Contract | In-process MCP client: `initialize` → `tools/list` → `tools/call` for each tool |
| Contract | Every tool's declared input schema accepts its valid fixture input and rejects a malformed one |
| Contract | No import from `@repo-prism/analyzer`, `@repo-prism/indexer`, `@repo-prism/graph-engine`, `@repo-prism/intelligence` |
| Integration | Two sequential tool calls index once, not twice |
| Integration | Non-existent workspace path yields a clean error, not a crash |
| Manual | Connect from Cursor using the README config; call each tool |

## 8. Risks

| Risk | Mitigation |
|---|---|
| MCP SDK version churn | Pin exactly; the handshake is the only coupling and the contract tests catch breakage |
| First tool call is slow because it indexes | Expected and documented; the alternative — indexing during handshake — looks broken instead |
| Agents call tools in a loop and thrash the index | Reuse the open workspace; M-035 owns any further budget work |
| stdio protocol corrupted by stray stdout | Every log goes to stderr; a test asserts stdout carries only protocol frames |

## 9. References

- Master Plan §MCP tool table · [ADR-0004](../adr/0004-core-only-integration-surface.md) ·
  [ADR-0019](../adr/0019-core-sdk-versioning.md) · [ADR-0024](../adr/0024-opt-in-network-integrations.md)
- Follow-on: [M-027](./M-027_mcp-tools-pack.md)
