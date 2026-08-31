# M-064 — Agent Dashboard Hub

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-064-agent-dashboard` (from latest `main`) |
| Depends on | Dispatch v2 (`dispatch/v2-agentic`, on `main`) |
| Unlocks | — |
| Packages | `@repo-prism/dispatch-hub`, `@repo-prism/mcp-server`, `@repo-prism/dispatch`, `@repo-prism/vscode-extension`, `@repo-prism/cursor-extension` |
| Amends | [ADR-0035](../adr/0035-dispatch-vertical.md) (second Dispatch consumer) |
| Adds | [ADR-0043](../adr/0043-agent-dashboard-hub.md) |

## 1. Goal

A persistent, non-terminal board of every Dispatch teammate across repositories,
plus a real “job done” signal when chat is idle. Cursor first; MCP Apps as a
thin in-chat companion.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-H1** | Job state is per-workspace JSON; each MCP process dies with the chat. | User-level Prism Hub daemon at `127.0.0.1:17330`, spawned by host MCP, surviving the session. |
| **P-H2** | No GUI for parallel jobs. | Loopback dashboard (React, `@repo-prism/ui` tokens) grouped by repository. |
| **P-H3** | MCP logging cannot push into idle chat. | Native OS notification on `job.finished`; Cursor IDE toast + status bar via HTTP to the hub. |
| **P-H4** | MCP Apps widgets collapse after the turn. | Thin `ui://prism/jobs` widget that links to the durable dashboard; `list_jobs` text still works without Apps. |
| **P-H5** | Extension must not import Dispatch (ADR-0035). | Extension speaks HTTP to the hub only. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Slack DM on job finish | Existing Slack connector; not this milestone |
| Claude Desktop / VS Code-only hosts beyond MCP Apps progressive enhancement | Follow-up |
| Global daemon as a logged-in OS service | Idle-exit is enough for v1 |
| Fan-out / agent orchestration UI beyond pause/resume/cancel | Existing `job_control` |

## 4. Definition of Done

- [x] Only one milestone `In Progress`
- [x] `@repo-prism/dispatch-hub` binds loopback `:17330`, writes `~/.prism/hub/hub.json` (`0o600`) with a token, registers workspaces, watches `.prism/dispatch/`
- [x] Dashboard lists jobs across repos with live activity, verification, commit, pause/resume/cancel
- [x] OS notification + IDE toast on job finish (no worktree paths)
- [x] Host MCP spawns the hub (`PRISM_HUB=0` opts out); `list_jobs` / `dispatch_doctor` name the board
- [x] `ui://prism/jobs` resource + `_meta.ui.resourceUri` on `list_jobs`
- [x] Extension command `prism.openAgentDashboard`; Cursor manifest mirrored
- [x] ADR-0043 Accepted; packages.md + dispatch docs updated
- [x] `bun run verify:milestone` green
- [x] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- [ADR-0043](../adr/0043-agent-dashboard-hub.md)
- [ADR-0035](../adr/0035-dispatch-vertical.md) Dispatch vertical
- [ADR-0039](../adr/0039-dispatch-chat-voice.md) Chat voice
- [ADR-0040](../adr/0040-dispatch-worker-supervisor.md) Worker supervisor
- [ADR-0042](../adr/0042-dispatch-durable-handoff-and-subagents.md) Durable handoff
