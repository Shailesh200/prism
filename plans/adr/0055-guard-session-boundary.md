# ADR-0055: Guard session boundary

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-16 |
| Decision makers | Owner, Architect |
| Related milestones | M-072 Prism Guard |
| Builds on | [ADR-0045](./0045-job-placement-checkout-first.md) §3 (preExistingChanges subtract) |

## Context

Prism Guard ranks "the current session" so a human reads the highest-risk
hunks first. On a live checkout, that is ambiguous: a dirty tree can hold
the user's own in-flight edits, a job's edits, or both mixed together.
ADR-0045 already solved this exact problem for checkout-placement jobs —
`preExistingChanges` captures what was dirty *before* the job started, so
the job's own review can subtract it. Guard needs the same subtraction, not
a new concept.

## Decision

**Session = `gitDirtyPaths(workspaceRoot) − preExistingChanges`.**

1. `gitDirtyPaths` is Core's own `getChangedPaths()` (no `base`): staged,
   unstaged, and untracked files in the working tree — the same "everything
   uncommitted" definition `prism review` already uses. Guard does not add a
   second definition of "dirty."
2. `preExistingChanges` is optional caller-supplied input, not something
   Core discovers itself. Core has no concept of a Dispatch job (AGENTS.md:
   Core is Dispatch-free) — the caller (an MCP `guard_session` call scoped
   to a job, a future Dispatch integration) passes the same
   `preExistingChanges` array ADR-0045 already computes and stores on the
   `JobRecord`. Omitted entirely, Guard ranks the live checkout's own dirty
   set — the IDE panel's case, where there is no job and nothing to
   subtract.
3. Files removed by the subtraction are reported back (`excludedPreExisting`),
   never silently dropped — a caller passing a stale or wrong list should be
   able to tell.

## Consequences

- Positive: one subtraction rule, reused instead of reinvented; Guard adds
  zero new state and no Dispatch dependency to Core or the IDE extensions.
- Negative: the IDE panel, with no job and no `preExistingChanges`, ranks
  the user's own live edits — appropriate for "read this before you commit,"
  not a substitute for a job's own isolated review.
- Follow-up: if a future cut wires Guard directly into a running job
  (rather than a manual MCP call), the caller is `@repo-prism/dispatch` or
  `@repo-prism/mcp-server` — never the IDE extension, which stays
  Dispatch-free per AGENTS.md.
