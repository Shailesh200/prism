# ADR-0043: Agent Dashboard Hub

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-31 |
| Decision makers | Owner, Architect |
| Related milestones | [M-064](../milestones/M-064_agent-dashboard.md) |
| Amends | [ADR-0035](./0035-dispatch-vertical.md) |

## Context

Dispatch jobs are the parallel-teammate product. Their live state already
exists as gitignored JSON under each repository's `.prism/dispatch/`
(`jobs.json` plus a `runs/<id>.json` sidecar). Three gaps remain:

1. **No GUI.** The only surface is MCP chat (`list_jobs`). Parallel jobs are
   invisible unless the user asks.
2. **No completion signal in an idle chat.** `startJobNoticeWatcher` emits
   `logging/message`, which lands in the MCP Logs panel. The 2026-07-28 MCP
   spec further restricts `notifications/message` to requests that opted in.
   Chat cannot be the pager.
3. **State is per workspace.** A global board needs a process that outlives
   any one `prism-mcp` and can watch more than one repo.

ADR-0035 currently says `@repo-prism/dispatch` is consumed only by the MCP
server. A dashboard that imported Dispatch from the IDE extension would put
jobs inside the Core-facing surface. A dashboard that lived only as an MCP App
iframe would disappear when Cursor collapses the “Worked for Ns” group.

## Decision

1. **User-level daemon `@repo-prism/dispatch-hub`.** Sibling to
   `dispatch-auth`: a surface over Dispatch, not inside it and not inside
   Core. Binds `127.0.0.1:17330`. Writes `~/.prism/hub/hub.json` (`0o600`)
   with `{ port, pid, version, token, startedAt }` and `registry.json` of
   known workspaces.
2. **MCP host spawns it.** `registerDispatchTools` (host role only) calls
   `ensureHub`. If the port is taken, that is the existing instance. Workers
   (`PRISM_DISPATCH_ROLE=worker`) never spawn. `PRISM_HUB=0` opts out.
3. **Loopback token + Origin check.** Every `/api/*` call requires the token
   from `hub.json`. Requests whose `Origin` is not loopback are rejected.
   Without this, any page the user visits could drive pause/cancel.
4. **Files remain the source of truth.** The hub calls `reapJobs` /
   `readRunState` / `createDispatchRuntime.handle("job_control")`. It does not
   grow a second job store.
5. **OS notification is the completion channel.** macOS
   `terminal-notifier`/`osascript`, Linux `notify-send`, Windows PowerShell
   toast — best-effort, ADR-0039 voice (title + result, never a worktree
   path). The Cursor extension additionally toasts via SSE. MCP logging
   stays as a diagnostic leftover.
6. **MCP App is progressive enhancement.** `list_jobs` keeps returning text.
   Hosts that render MCP Apps get `ui://prism/jobs`. The widget is not the
   board of record.
7. **The IDE extension does not import Dispatch.** It reads `hub.json` and
   speaks HTTP. That keeps ADR-0035's Core/Dispatch split intact for the
   editor.
8. **Idle exit.** 15 minutes with no SSE client and no in-flight job, the
   daemon exits. The next MCP launch respawns it. No login-item, no launchd
   plist.

### Port

| Port | Owner |
|---|---|
| 17321 | Extension Core browser bridge |
| 8765 | Dispatch OAuth loopback |
| 4173 | Lab / Lighthouse |
| **17330** | **Hub dashboard** |

## Options Considered

### Option A — User-level hub daemon (chosen)

- Pros: global board; survives chat; zero extra install (`npx prism-mcp`
  spawns it); OS notifications work with the chat closed.
- Cons: another long-lived local process; loopback must be locked down.

### Option B — MCP App iframe only

- Pros: native to Cursor chat; no daemon.
- Cons: widget collapses after the turn; no signal when chat is idle; one
  repo per MCP server.

### Option C — Jobs screen inside the existing extension webview

- Pros: richest IDE chrome.
- Cons: requires the extension; would import Dispatch or duplicate it;
  does not help Claude / `npx` users.

## Consequences

- Positive: parallel jobs are visible; “done” reaches the user without
  polling chat; ADR-0035's analysis/Dispatch split is preserved in the editor.
- Negative: a second consumer of `@repo-prism/dispatch` (MCP + hub);
  `~/.prism/hub/` is a new home-dir location next to
  `~/.prism/dispatch-secrets.json`; leftover processes if idle-exit fails.
- Follow-ups: Slack DM on finish; Claude-host polish; optional launchd if
  idle-exit proves annoying.

## Compliance

- [x] Updates Master Plan if roadmap impacted — M-064
- [x] Updates package README(s) if API impacted — dispatch-hub + mcp-server
- [x] Linked from milestone doc — M-064
