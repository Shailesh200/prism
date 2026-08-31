# ADR-0045: Job placement — checkout-first, commit on ask

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-01 |
| Decision makers | Owner, Architect |
| Related milestones | [M-066](../milestones/M-066_checkout-first-jobs.md) |
| Amends | [ADR-0040](./0040-dispatch-worker-supervisor.md), [ADR-0042](./0042-dispatch-durable-handoff-and-subagents.md) |

## Context

Since Dispatch v1, every job works in a separate git worktree and Prism
commits the result to a job branch when the worker stops (ADR-0040,
ADR-0042 §1). That default was built for two pressures: parallel jobs must
not collide, and an uncommitted worktree is destroyed on prune, so the
commit is what makes the work durable and reviewable.

Owner direction (2026-09-01): a job should **not** work on a different
worktree or commit unless explicitly asked, or unless the intent is to work
on a different branch. The mental model is a pair programmer typing in the
user's own tree: the edits show up in the IDE, review is the user's normal
`git diff`, and a commit happens when the user asks for one.

The worktree rationale does not disappear — it moves to the cases that
actually have those pressures.

## Decision

1. **`placement: "checkout" | "worktree"`, default checkout.** The worker's
   cwd is the user's current checkout on the current branch. `configure`
   (`placement`) changes the default for users who preferred worktree-first.
2. **No commit on checkout finish.** The worker stops; Prism runs
   typecheck/tests; the edits stay uncommitted. ADR-0042's durability
   argument does not apply: the checkout is the user's real tree and is
   never pruned. "Commit it" is an explicit user ask; Prism stages **only
   the job-touched file set**, never the user's unrelated changes.
3. **Job-touched set = changed-at-finish minus dirty-at-start.** Dispatch
   snapshots dirty paths before the worker starts; the review and any
   later commit subtract them. A file dirty at start *and* edited by the
   job is flagged as mixed, not silently attributed.
4. **Dirty tree asks first.** Dispatching onto a dirty checkout returns
   `needsConfirm`: "the teammate will work alongside your uncommitted
   changes" — confirm, or redirect to a worktree. (Owner, 2026-09-01.)
5. **One checkout job at a time.** A concurrent second job takes a
   worktree and chat says why. Isolation intent ("on a branch", "keep my
   tree clean", "separate worktree") always takes the worktree path with
   today's commit-on-finish and review-before-land unchanged.
6. **Cancel in a checkout cannot un-edit.** The voice says so: the edits
   are in the user's tree; discarding is the user's git call. This is the
   price of checkout-first and is stated in the review message.
7. **Verification caveat.** Checks run against the live tree; when it was
   dirty at dispatch, the result is reported with "your uncommitted
   changes were present" so a failure is not misattributed to the job.

## Options Considered

### Option A — Checkout-first (chosen)

- Pros: matches the pair-programmer mental model; no "where did my work
  go"; review is the user's normal flow; worktrees remain for parallelism
  and explicit isolation.
- Cons: cancel cannot roll back; dirty-tree mixing needs the snapshot
  machinery; verification can fail on the user's own half-finished work.

### Option B — Worktree-first forever (status quo, rejected)

- Pros: perfect isolation; clean cancel; commit range is the review.
- Cons: every casual job produces a branch the user never asked for and a
  merge step they did not want; the owner rejected the default.

### Option C — Checkout with auto-commit of touched files (rejected)

- Pros: durable, attributable.
- Cons: a commit on the user's current branch they did not ask for is
  exactly what this decision removes; "commit it" stays the user's call.

## Consequences

- Positive: Dispatch feels native to the user's tree; worktree/branch
  ceremony only appears when isolation is real (parallel, explicit).
- Negative: the finish path forks on placement; the dirty-path snapshot
  must be captured before the worker's first edit; cancel voice must be
  honest about the missing rollback.
- Follow-ups: `job_control` merge/discard actions if chat-driven git
  proves awkward; ADR-0046 for the `claude --bg` spike.

## Compliance

- [x] Updates Master Plan if roadmap impacted — M-066
- [x] Updates package README(s) if API impacted — dispatch, mcp-server
- [x] Linked from milestone doc — M-066
