# ADR-0054: Global job store

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-10 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch Console (post M-064) |
| Amends | [ADR-0043](./0043-agent-dashboard-hub.md) |

## Context

ADR-0043 keeps files as the source of truth: the hub does not grow a second
job store. Those files lived at `{repo}/.prism/dispatch/jobs.json`. Switching
checkouts, git worktrees, or “root vs repo” made the Console drop rows —
jobs were sometimes in the repo and sometimes only in a worktree copy, and
the hub only read registered workspaces.

## Decision

1. **Location, not source of truth.** Job records (including worktree *info*
   on the record) live under `~/.prism/dispatch/workspaces/<sha24>/jobs.json`
   plus `meta.json` pointing at the checkout. Files remain the store; only the
   path is global.
2. **Git worktrees stay in the repo.** Run logs and notes stay per-repo. The
   global file stores the job graph, not a second copy of the tree.
3. **One-time lift.** On first load, merge `{repo}/.prism/dispatch/jobs.json`
   and any worktree copies into the global file, then retire the legacy file as
   `jobs.json.migrated`. A leftover primary file is lifted on later loads too.
4. **Hub reads stored roots.** `collectJobs` unions the workspace registry
   with `listStoredWorkspaceRoots`, so a job does not vanish when its
   checkout leaves the registry.
5. **Tests stay local.** Vitest without `PRISM_HOME` keeps the repo-local
   path so fixtures do not write `~/.prism`. `PRISM_JOBS_LOCAL=1` forces
   local.

## Options Considered

### Option A — Global `~/.prism/dispatch/workspaces/` (chosen)

- Pros: one file per checkout; survives repo switches and worktrees; Console
  can show every job Prism has seen.
- Cons: a second path to reason about; needs a one-time migrate.

### Option B — Keep per-repo files and teach the hub to scan worktrees

- Pros: no migrate.
- Cons: worktree copies still diverge; “jobs at root” vs repo remains.

## Consequences

- Positive: Dispatch Console and Pulse share one job list across repos.
- Negative: operators grepping `{repo}/.prism/dispatch/jobs.json` will see a
  retired file.
- Follow-ups: Spectrum follows `registry.json` `selectedPath` for the repo it
  indexes (not this store).
