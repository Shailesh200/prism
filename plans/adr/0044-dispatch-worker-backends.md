# ADR-0044: Dispatch worker backends (host-matched agent CLI)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-31 |
| Decision makers | Owner, Architect |
| Related milestones | [M-065](../milestones/M-065_claude-code-worker.md) |
| Extends | [ADR-0035](./0035-dispatch-vertical.md), [ADR-0040](./0040-dispatch-worker-supervisor.md) |
| Amends | [ADR-0038](./0038-cursor-worker-sdk-login.md) |

## Context

Dispatch jobs run on a local worker: a detached child process that drives an
agent inside a git worktree (ADR-0040). The only worker is the Cursor SDK
(`Agent.create`), signed in via `Cursor.auth.login` (ADR-0038). The MCP
server itself is host-agnostic — Claude Code and Codex connect over stdio —
but `start_job` from those hosts still spawns a **Cursor** agent and demands
a Cursor login. For a user who lives in Claude Code, that is the wrong
product: a second account grant for an editor they do not use.

ADR-0038 option C ("skip the SDK worker when already in a chat") stays
rejected: in-chat work cannot run in parallel, cannot stall-detect, and
cannot appear on the hub board. The fix is a second **worker backend**, not
a second Dispatch.

## Decision

1. **`WorkerBackend = "cursor" | "claude"`.** The supervisor (worktree,
   run-log, stall, commit, verify, review) is unchanged and backend-neutral.
   Only the child that drives an agent is backend-specific:
   `worker-child.js` (Cursor SDK) and `claude-worker-child.js` (Claude CLI).
2. **Resolution order.** `configure` (`workerBackend`) → `PRISM_WORKER` env →
   MCP `clientInfo.name` (`claude-code*` → `claude`) → default `cursor`.
   The host chat and the worker are the same family unless the user says
   otherwise.
3. **Claude worker = `claude -p` subprocess, no SDK dependency.** The CLI is
   already the prerequisite (the user signed in there). Spawned with
   `--bare` (no hooks, skills, plugins, MCP servers, or CLAUDE.md
   auto-discovery — ADR-0041's no-second-index rule), `--output-format
   stream-json --verbose`, cwd = job worktree. Allowed tools: `Read Edit
   Write Grep Glob LS` plus `Task` when subagents are on (ADR-0042 §4).
   `Bash` is denied: no shell, so no `bun install` against the symlinked
   `node_modules` and no re-index. Prism — never the worker — commits and
   runs checks (ADR-0042 §3).
4. **Events map onto the existing console.** stream-json
   `system/init` (capture `session_id`), `assistant` (text → thinking,
   `tool_use` → tool/editing), `result` (terminal). `job_logs`, stall
   detection, the hub board, and OS notify read the same files and do not
   know which backend wrote them.
5. **Resume via `session_id`.** Stored where the Cursor backend stores
   `agentId`; resume spawns `claude -p --resume <session_id>`.
6. **Auth is detection, not a new grant.** Claude workers use the machine's
   existing Claude Code sign-in (`~/.claude` credentials or
   `ANTHROPIC_API_KEY`). `init` checks the CLI is on PATH and signed in, and
   says `run claude once in a terminal to sign in` when not. We never paste
   keys into mcp.json (ADR-0038), and we do not spawn Claude's interactive
   login from a stdio server.
7. **Shared finish.** Commit, verify, and cited-path audit move from
   `worker-child.ts` into `worker-finish.ts`, called by both children. One
   implementation, no drift.

## Options Considered

### Option A — Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) (rejected)

- Pros: typed messages, `can_use_tool` callbacks, session helpers.
- Cons: new dependency that itself spawns the `claude` CLI; the CLI's
  stream-json is already a stable contract; a package bump cannot fix a CLI
  the user has not installed.

### Option B — `claude -p` subprocess with stream-json (chosen)

- Pros: zero new dependencies; the CLI is the prerequisite anyway; flags
  (`--bare`, `--allowedTools`, `--resume`) map 1:1 onto ADR-0041/0042 rules.
- Cons: we parse JSONL ourselves; CLI flag drift needs a contract test.

### Option C — Route Claude-host jobs to the Cursor worker (status quo, rejected)

- Pros: nothing to build.
- Cons: Claude Code users must create a Cursor account to run a teammate;
  wrong product for the host.

## Consequences

- Positive: Claude Code users get the full Dispatch loop (jobs, console,
  stall, review, board) with the sign-in they already have; the Codex worker
  becomes the same shape of change; Cursor behavior is untouched.
- Negative: two worker children to keep on the same finish contract;
  `claude` CLI presence becomes a runtime precondition to detect and
  explain; stream-json parsing needs contract coverage.
- Follow-ups: Codex worker on the same seam; Gemini CLI after two backends;
  `configure` surface for `workerBackend` in the dashboard.

## Compliance

- [x] Updates Master Plan if roadmap impacted — M-065
- [x] Updates package README(s) if API impacted — dispatch + mcp-server
- [x] Linked from milestone doc — M-065
