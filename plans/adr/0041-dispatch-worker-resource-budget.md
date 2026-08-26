# ADR-0041: Dispatch worker resource budget

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-26 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch v1 (`dispatch/v1`) |
| Extends | [ADR-0040](./0040-dispatch-worker-supervisor.md) |

## Context

ADR-0040 moved the Cursor agent loop out of the prism MCP process. One job
still hung the laptop, crashed Cursor, and filled the Data volume. Two
independent leaks remained:

1. **Second Prism.** Workers were given a full `prism` MCP (Intelligence +
   Dispatch). That started a second index against a git worktree and contended
   on SQLite, even when `PRISM_WORKSPACE` pointed at the host repo.
2. **Second install.** The teammate ran `bun install` in
   `.prism/dispatch/worktrees/<id>`. Each tree grew a real `node_modules`
   (~950 MB here; host install is ~1.9 GB). Two jobs ≈ 2 GB of duplicate
   packages on a volume already at 95% full.

Google Cloud **Branding status: verified** is a separate issue: it does not
clear the OAuth warning for Calendar’s sensitive scope. That is not a worker
bug; see Consequences.

## Decision

1. **No Prism MCP on job agents.** `Agent.create` gets `mcpServers: {}`,
   `local.settingSources: []`, sandbox on, and a **tools allowlist** with no
   `shell`, `mcp`, or `task`. If `PRISM_DISPATCH_ROLE=worker` is ever set,
   `createPrismMcpServer` still skips Intelligence registration.

2. **One install.** After creating or resuming a Prism worktree, replace a
   real `node_modules` with a symlink to the host repo’s `node_modules`. Only
   paths under `.prism/dispatch/worktrees/` are touched.

3. **Cap and refuse.** Default `maxJobs` is **1**. `start_job` / resume refuse
   when free disk is below 1 GB or free RAM is below 400 MB. The child is
   niced (`setPriority` 10). Do **not** set `NODE_OPTIONS=--max-old-space-size`
   on the agent — that inherited cap GC-thrashed the Cursor agent on 8 GB
   machines.

4. **No shell / no second Prism CLI.** A teammate with shell ran `prism` and
   wrote `.prism/audit/*` (a second full intelligence pass) while host chat
   also indexed — that exhausted RAM. Repo-wide audit/health is host
   `repository_health`, not `start_job`.

5. **Google Calendar warning.** Branding verification ≠ app verification for
   `calendar.readonly`. Connect copy tells the user to click **Advanced**,
   then continue. Submitting Calendar scope verification on the Prism Auth
   GCP project is Prism’s job, not the user’s.

## Options considered

### A — Keep host-index Prism MCP on workers (rejected)

Still spawned a second stdio server and Intelligence tool surface. One job
was enough to hang Cursor.

### B — Copy or `bun install` per worktree (rejected)

Filled the disk. Isolated `node_modules` is not required for v1; the host
install already matches the repo.

### C — Cloud workers (rejected)

Local-first, ADR-0035.

### D — No MCP + no shell + symlink install + disk/RAM gates (chosen)

## Consequences

- Positive: one job no longer duplicates ~1 GB of packages or starts a second
  Prism index. Parallelism remains the product; the default cap is conservative
  until that is proven on this machine.
- Negative: workers cannot call `blast_radius` or run tests via shell. Host
  chat still can. Symlinked `node_modules` means a worker `bun add` would
  mutate the host install — workers have no shell, so they cannot.
- Follow-ups: optional limited shell for `bun test` on a allowlist; raise
  default `maxJobs` after soak on machines with 16 GB+ RAM.

## Compliance

- [x] Architecture docs — `docs/architecture/decisions.md`,
  `docs/mcp/dispatch.md`
- [x] Code — `@repo-prism/dispatch` worktree-install + worker-budget;
  MCP worker role skips Intelligence
- [ ] Master Plan — product vertical, not an Intelligence milestone
