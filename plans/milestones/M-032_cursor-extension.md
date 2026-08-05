# M-032 — Cursor Extension

| Field | Value |
|---|---|
| Branch | `milestone/M-032-cursor-extension` |
| Status | Verified |
| Depends on | M-030 (shell), M-031 (full UI) |
| Unlocks | M-037 |
| Packages | `@repo-prism/cursor-extension`, `@repo-prism/vscode-extension`, `@repo-prism/core` |

## Goal

Ship a Cursor-branded packaging overlay of the VS Code extension so Prism
installs and activates in Cursor with the **same Core path** (no fork of
analysis). Document coexistence with MCP clients.

## In Scope

- Resolve [Q-004](../OPEN_QUESTIONS.md) via ADR: single extension product + Cursor overlay
- `@repo-prism/cursor-extension` builds by staging `@repo-prism/vscode-extension` `dist`/`media`
- Cursor-oriented manifest (display name, description, categories)
- Launch config **Run Prism Cursor Extension** (F5 in Cursor)
- README: install / activate / MCP coexistence notes
- Contract test: overlay package + Core identity unchanged

## Out of Scope

- Marketplace / Open VSX publish
- Separate analysis implementation
- MCP server implementation (M-026+) — docs only for coexistence

## Definition of Done

- [x] F5 **Run Prism Cursor Extension** activates in Cursor Extension Host
- [x] Same commands / Core session as VS Code package (overlay of shared build)
- [x] ADR + Q-004 resolved; README documents MCP coexistence
- [x] Owner approval → commit → merge → Verified

## Verification

`bun run verify:milestone` · Manual Cursor Extension Host checklist (F5)

## Manual checklist

1. Open Prism repo in **Cursor**
2. F5 → **Run Prism Cursor Extension**
3. Open a folder → **Prism: Open Prism** → Overview loads
4. Confirm Output **Prism** logs Core index (same path as VS Code package)
