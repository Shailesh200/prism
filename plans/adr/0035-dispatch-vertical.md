# ADR-0035: Dispatch vertical on the Prism MCP server

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-26 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch v1 (`dispatch/v1`) |
| Supersedes | — |

## Context

Prism's MCP server is a read-only adapter over `@repo-prism/core` (ADR-0004):
every tool indexes the workspace, returns a Core `Result`, and never writes.
A second product — Dispatch — needs to manage jobs, git worktrees, OAuth
drivers, and local Cursor SDK workers. Those operations are not analysis, must
not require an index, and must not store tokens in the indexer SQLite cache.

ADR-0004's Core-only rule for **analysis** still holds. Dispatch is a second
façade, not a second copy of blast radius.

## Decision

1. **Same MCP server name `prism`.** Dispatch tools live next to Intelligence
   tools. Split into a second server only if the combined list hurts Cursor
   quality.
2. **New package `@repo-prism/dispatch`.** `mcp-server` may depend on
   `dispatch` + `core` + `shared`. Core must not import Dispatch. Engine
   packages stay internal.
3. **Dual registration path.** Intelligence tools keep `registerTools` (session
   open + index + Core `Result`). Dispatch tools use `registerDispatchTools`,
   which never calls `session.ready()`.
4. **Consent.** New purposes (`network.github-user`, `network.linear`,
   `network.jira`, `network.slack`, `network.notion`,
   `network.google-calendar`) live in `@repo-prism/shared`. Dispatch reads and
   writes `.prism/consent.json` itself. Completing loopback OAuth in the
   browser is the human grant. Intelligence MCP tools still cannot call Core
   network APIs.
5. **Tokens** live in the OS keychain (0600 file fallback). Never in
   `cache.db`.
6. **Worker role.** `PRISM_DISPATCH_ROLE=worker` hides `start_my_day` and
   `start_job`, and refuses OAuth-start, so workers cannot recurse. Workers
   still get Intelligence tools plus `list_jobs` / `remember`.
7. **Adopt worktrees first.** Match existing Cursor/Claude trees; create
   `.prism/dispatch/worktrees/<id>` only when none exists.

## Options Considered

### Option A — Second façade on the same MCP server (chosen)

- Pros: One `@prism` teammate; Intelligence + Dispatch share process and
  workspace root; worker can call `blast_radius` without a second install.
- Cons: Larger tool list; Dispatch tools are not Core DTOs.

### Option B — Separate `prism-dispatch` MCP server

- Pros: Keeps the Intelligence pack read-only and small.
- Cons: Two servers to enable; workers still need Intelligence; users think in
  one teammate.

### Option C — Put OAuth and jobs inside Core

- Pros: One façade.
- Cons: Violates local-first analysis, mixes write/network into the SDK every
  surface must take, stores secrets next to the index.

## Consequences

- Positive: start-my-day works before the first index; tokens stay out of
  SQLite; ADR-0004 remains true for analysis.
- Negative: mcp-server now has two tool wrappers; docs must distinguish
  read-only Intelligence from Dispatch writes.
- Follow-ups: Prism Auth broker (ADR-0036); Claude Code as a worker; export-settings
  UX beyond JSON.

## Compliance

- [x] Updates Master Plan if roadmap impacted — product vertical, not an
      Intelligence milestone
- [x] Updates package README(s) if API impacted — mcp-server + dispatch
- [x] Linked from milestone doc — this ADR is the Dispatch v1 record
