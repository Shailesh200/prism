# ADR-0047: Dispatch settings live in `~/.prism`

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-01 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch v1 (`dispatch/v1`) |
| Amends | [ADR-0035](./0035-dispatch-vertical.md), [ADR-0043](./0043-agent-dashboard-hub.md) |

## Context

`configure` (dispatchMode, placement, worker backend, maxJobs, standup
layout, standing preferences) wrote `.prism/dispatch/config.json` inside
the repository. Opening a second repo meant those choices were gone, so
the agent asked teammate-or-inline again, or used checkout vs worktree
defaults the user had already changed.

The same file was also invisible to a second MCP host. Configuring
Dispatch in Cursor did not apply in Claude Code, Codex, or Claude
Desktop — each process would have needed its own in-repo copy.

Job state cannot follow that path: jobs, run logs, and worktrees are
about one tree. Secrets already live in the OS keychain / `~/.prism`.

## Decision

1. **User-global Dispatch settings** live at
   `~/.prism/dispatch/config.json`. `configure` reads and writes that
   file. Every repository **and every MCP host** on the machine (Cursor,
   Claude Code, Codex CLI, Claude Desktop) sees the same values.
2. **User-scoped memories** (`remember` with `scope=user`) live at
   `~/.prism/dispatch/memory.json`. Repo- and job-scoped memories stay
   in the workspace `.prism/dispatch/memory.json`.
3. **Per-repo job state stays in the repo:** `jobs.json`, `runs/`,
   worktrees, checkout notes. Those are not configuration.
4. **MCP install stays per-host.** `~/.cursor/mcp.json`, `claude mcp add`,
   `~/.codex/config.toml`, and Claude Desktop's json still register the
   server. This ADR shares Dispatch *settings*, not those install files.
   Worker vendor credentials stay per-backend (Cursor SDK vs `~/.claude`).
5. **`workerBackend: auto` still matches the host that started the job**
   (Cursor workers in Cursor, Claude workers in Claude Code). Codex has
   no worker CLI yet, so `auto` from Codex uses Cursor. An explicit
   `configure workerBackend cursor|claude` is the cross-host override
   stored in this same file.
6. **One-time migrate.** If the home file is missing and an in-repo
   `config.json` (or user-scoped memories) exists, copy it to `~/.prism`
   and then prefer the home copy. `PRISM_HOME` overrides the directory
   (CI, tests).

## Options considered

### A — Home-dir settings, repo job state (chosen)

- Pros: configure once; matches hub (`~/.prism/hub`) and secrets; one
  file for every repo and every MCP host of this Unix user.
- Cons: a repo cannot pin a different `dispatchMode` without
  `PRISM_HOME`. That is the request.

### B — Keep per-repo config (rejected)

- Pros: a clone can carry its own Dispatch defaults.
- Cons: the user re-teaches every repo; this is the failure.

### C — Home defaults with a repo overlay (rejected for now)

- Pros: escape hatch per repo.
- Cons: two files to reason about; not asked for. Revisit if a repo
  genuinely needs a different worker backend.

### D — Unify MCP install files across hosts (rejected)

- Pros: one `prism mcp install` would cover Cursor, Claude, Codex.
- Cons: each host owns its own config format. Out of scope; `prism mcp
  install --client all` already writes each file separately.

## Consequences

- Positive: `configure` in Cursor, Claude Code, Codex, or Claude Desktop
  applies to every other host and every other repo on this machine.
- Negative: two developers on one machine share `~/.prism` unless they
  set `PRISM_HOME`.
- Follow-ups: a Codex worker backend remains deferred (ADR-0044). `auto`
  from Codex keeps using Cursor workers until that exists.

## Compliance

- [x] Architecture docs — `docs/architecture/decisions.md`,
  `docs/mcp/dispatch.md`
- [x] Package README — `@repo-prism/dispatch`
- [x] Code — `config.ts`, `memory.ts`, `paths.ts`
