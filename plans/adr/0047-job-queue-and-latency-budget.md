# ADR-0047: Job queue, honest timestamps, and a dispatch latency budget

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-02 |
| Decision makers | Owner, Architect |
| Related milestones | [M-067](../milestones/M-067_shippable-product.md) |
| Amends | [ADR-0040](./0040-dispatch-worker-supervisor.md), [ADR-0041](./0041-dispatch-worker-resource-budget.md), [ADR-0045](./0045-job-placement-checkout-first.md) |

## Context

The 2026-09-02 audit found two coupled defects in the dispatch pipeline.

**`start_job` did everything before returning.** A disk stat, `loadConfig`, a
full `reapJobs` over every run sidecar, `git rev-parse` plus a dirty-path
scan or `git worktree add`, a `linkWorktreeInstall` symlink, an overlap
check, a sign-in that tops out at 180 seconds, and finally the worker spawn.
Chat sat blocked through all of it.

**Every gate along that path returned a message and created no job.** Dirty
tree, path overlap, the RAM floor, the disk floor and the concurrency cap all
returned early, before the first `upsertJob`. A refused dispatch left nothing
behind: no row on the board, no record that the user had asked for anything,
nothing to retry. `ready` also counted toward `activeJobCount`, so job #2 was
refused while job #1 was still logging in.

Separately, three surfaces disagreed about how long a job had taken.
`JobSnapshot.elapsedMs` measured `now - createdAt` where `createdAt` was
stamped at enqueue — so a 180-second login was charged to the agent. It was
recomputed only when a job's snapshot key changed, so it froze and then
jumped. And because every snapshot recomputed *all* rows against `Date.now()`,
a finished job's time kept growing whenever any unrelated job updated. The
Claude statusline measured from `updatedAt` instead, and floored to whole
minutes, so the same job showed two different durations and a 40-second job
read as `0m`.

Finally, `jobs.json` was an unlocked read-modify-write with a direct
`writeFile`. The MCP process, the hub daemon and each worker supervisor all
write it.

## Decision

1. **`start_job` accepts and returns.** It validates, allocates an id from one
   `loadJobs` read, writes a `queued` record, kicks the drain without awaiting
   it, and returns. Budget: **under 500ms**, covered by a test that injects a
   1.5-second sign-in.
2. **A `queued` status and a drain loop.** `queue.ts` owns everything
   `start_job` shed. Two things drive it: a fire-and-forget kick from
   `start_job` (so a job moves with no daemon running) and the hub's existing
   2-second watch tick (so a job outlives the MCP process that queued it).
   Both call the same idempotent `drainWorkspace`, guarded by an in-process
   lock and a compare-and-set claim.
3. **Gates become states, not messages.** A dirty checkout or a path overlap
   parks the job at `needs_confirm` with the question stored on the record, so
   the board can render a Confirm action and `job_control confirm` can answer
   it. Auth failure parks at `blocked`. Resource pressure and the cap leave the
   job `queued` with the reason in `nextStep`. Nothing is ever dropped.
4. **The cap counts workers, not intentions.** `activeJobCount` counts
   `running`, `booting` and `waiting_on_you`. `ready` no longer counts and
   `queued` never did.
5. **Sign-in re-queues automatically.** A successful `init` returns every
   `blocked`/`worker-auth` job to the queue, removing the manual `resume`.
6. **Four timestamps.** `createdAt` accepted, `queuedAt` entered the queue,
   `startedAt` worker launched, `finishedAt` clock stopped. `startedAt` is
   stamped at the `running` transition, not at claim, so git setup and sign-in
   are charged to the pipeline rather than to the agent.
7. **`finishedAt` means "the clock stopped", and covers `paused`.** A paused
   job has a record but no process; letting its worked time climb overnight
   would be the same class of lie. It clears when the job starts moving again.
8. **No server-computed duration.** `JobSnapshot` ships raw timestamps.
   `jobDurations`, `primaryDurationMs` and `formatJobDuration` live in
   `@repo-prism/shared`, and every surface — board, job detail, `list_jobs`,
   statusline — uses them. Unknown renders as unknown, never as `0s`.
9. **Atomic writes.** `writeJsonFile` stages to a sibling temp file and
   `rename`s. The temp name carries the pid *and* a UUID: pid alone collides
   when two writers inside one process land in the same millisecond, and the
   loser's rename fails with `ENOENT`.

## Options Considered

### Option A — Queue plus drain loop (chosen)

- Pros: chat replies immediately; nothing is silently dropped; the cap becomes
  a wait rather than a refusal; one place owns admission.
- Cons: the contract is now two-phase, so every caller and test has to observe
  the job rather than the return value; a failure that used to be a chat
  sentence is now a state someone has to look at.

### Option B — Keep it synchronous, just make it faster

- Pros: no contract change; no new statuses.
- Cons: the slowest step is an interactive browser login. No amount of
  optimisation makes that fit in 500ms, and the dropped-job problem is
  orthogonal to speed — it would survive untouched.

### Option C — Queue in the hub only, with `start_job` refusing when the hub is down

- Pros: one drain owner, no in-process kick, simplest concurrency story.
- Cons: makes the daemon a hard dependency of dispatching. Prism is
  local-first and the hub idle-exits by design; a job typed into chat must
  start whether or not a background process happens to be alive.

## Consequences

- Positive: dispatch feels instant; a refused job is visible and retryable; one
  duration vocabulary across every surface; concurrent writers cannot tear
  `jobs.json`.
- Negative: two-phase dispatch is harder to test (hence `drain-harness.ts`);
  the fire-and-forget kick can outlive its caller, so anything tearing down a
  workspace must `settleDrains()` first; a cross-process claim race remains
  theoretically possible in the window between reading and writing a claim,
  narrowed but not closed by atomic writes.
- Follow-ups: the drain moves into the Console daemon in P-S2; ADR-0046 adds a
  third worker backend on the same queue.

## Compliance

- [x] Updates Master Plan if roadmap impacted — M-067
- [x] Updates package README(s) if API impacted — dispatch, dispatch-hub, shared
- [x] Linked from milestone doc — M-067
