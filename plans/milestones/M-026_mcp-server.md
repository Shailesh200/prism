# M-026 — MCP Server Foundation

| Field | Value |
|---|---|
| Branch | `milestone/M-026-mcp-server` |
| Status | Not Started |
| Depends on | M-025 |
| Unlocks | M-027 |
| Packages | `@prism/mcp-server` |

## Goal

Ship a working MCP server process that initializes against a workspace path and exposes a minimal tool set plus resources/handshake compatibility with Cursor and other MCP clients.

## In Scope

- MCP SDK server bootstrap (stdio)
- Tools (minimal): `repository_dna`, `repository_health` (or stubs if health delayed—prefer real Core calls)
- Workspace path configuration via env/args
- README: connect from Cursor / Claude Code
- Contract tests with MCP mock client

## Out of Scope

- Full tool pack (M-027)
- HTTP transport (optional later ADR)

## Definition of Done

- [ ] Server starts and lists tools
- [ ] At least 2 tools return real Core data on fixture
- [ ] Client setup docs written
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration (MCP client mock) · Build · Manual Cursor connect checklist
