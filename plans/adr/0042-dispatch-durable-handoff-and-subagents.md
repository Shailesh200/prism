# ADR-0042: Dispatch durable handoff, worker verification, and subagents

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-31 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch v2 (`dispatch/v2-agentic`) |
| Amends | [ADR-0040](./0040-dispatch-worker-supervisor.md), [ADR-0041](./0041-dispatch-worker-resource-budget.md) |

## Context

An audit of the shipped Dispatch flow on `main` (7a7826c) found that a job can
complete, produce real work, report success, and lose the work entirely.

Evidence from this repository's own `.prism/dispatch/jobs.json`. Job
`audit-find-issues-in-the-repo` finished with `status: "done"` and this
summary:

> "Changed 1 file (node_modules). Audit complete. Intelligence reports are in
> `.prism/audit/`; the full write-up is at
> `.prism/dispatch/notes/audit-find-issues-in-the-repo.md`"

Neither path exists in the host repository. Both exist inside the job
worktree, `.gitignore` line 20 is `.prism/`, the branch
`dispatch/audit-find-issues-in-the-repo` has **zero commits** ahead of `main`,
and `git diff --stat HEAD` in that worktree is empty. A 10 KB write-up and ten
JSON reports were produced and stranded as untracked, gitignored files under a
worktree path the chat voice rules forbid ever speaking aloud.

Five defects combine to produce that outcome:

1. **No commit.** `worker-child` computes `gitChangeSummary` but never commits.
   Nothing makes the work reachable from a ref.
2. **Unvalidated summary.** `assistantText(result.result)` is echoed verbatim
   into `resultSummary`. Nothing checks that cited paths exist, and
   worktree-relative paths are read by the user as repo-relative.
3. **No verification.** ADR-0041 removed `shell` from the agent, so a worker
   cannot run `bun test` or `typecheck`. Jobs report `done` on unverified
   edits, which contradicts the repository rule that every change passes the
   verification suite.
4. **No subagents.** The tool allowlist has no `task`, so a job is one flat
   agent. There is no decomposition for multi-part work.
5. **Worktree leak.** Three worktrees (58 MB) survive for one job record.

ADR-0040 states "parallel local workers are the Dispatch hero product" while
ADR-0041 sets `maxJobs` default to 1, so the hero capability ships disabled.

The resource findings behind ADR-0041 remain valid: a worker with a full shell
ran the `prism` CLI and started a second index, and per-worktree
`bun install` filled the disk. This ADR does not restore either.

## Decision

### 1. Durable handoff — work must be reachable from a ref

`worker-child` commits on the job branch after the agent stops, before
reporting a terminal phase.

- The commit is `git add -A` scoped to the worktree plus a
  `dispatch(<jobId>): <title>` message, authored as the Dispatch worker.
- Gitignored output is the normal case for report-style jobs, so the commit
  step force-adds a **bounded allowlist** of job artifact paths
  (`.prism/dispatch/notes/**`) and nothing else under `.prism/`.
- `gitChangeSummary` is computed from the commit, not from the dirty tree, so
  the summary describes what actually shipped.
- A run that produces **no commit and no tracked change** may not report
  `done`. It reports `done` with an explicit "produced no reviewable change"
  summary. Silence is not success.

### 2. Result summaries are checked, not echoed

The assistant's closing text is treated as untrusted. Before it reaches the
user, `resultSummary` composition:

- resolves any path the model cites against the worktree,
- drops or rewrites paths that do not exist,
- reports paths that exist as branch-relative (`<branch>:<path>`), never as a
  bare host-looking path and never as an absolute worktree path.

A fabricated artifact reference is a reportable failure of the run, not a
cosmetic issue.

### 3. Verification runs in the supervisor, not in the agent

ADR-0041's safety property is that **the agent** has no shell. It is not that
no process may run a command. `worker-child` is plain Node and already owns
the process lifecycle, so it runs verification itself after the agent stops:

- a **fixed, non-configurable** command allowlist (`typecheck`, `test`), run
  through the repository's package manager in the worktree,
- with a wall-clock timeout and captured exit codes,
- never a command chosen by the model, and never `install`, `add`, or the
  `prism` CLI (no second index — ADR-0041 §4 stands).

The outcome lands in run state as `verification: "passed" | "failed" |
"skipped"` and is spoken in `list_jobs`. A job whose verification fails
reports `done` **with a failing check**, not a clean finish.

### 4. Subagents — in-process now, host fan-out behind a flag

Two shapes, different costs, both admitted:

**In-process (default on).** `task` joins the worker tool allowlist. One
Cursor agent decomposes its own work into subagents inside the process it
already has. This adds no new OS process, no new worktree, and no second
index, so the ADR-0041 resource findings do not apply. `shell` and `mcp` stay
out of the allowlist, so a subagent inherits the same sandbox as its parent.

**Host fan-out (default off).** `start_job` may split a brief into sibling
sub-jobs, each with its own worktree and its own `worker-child`. This is the
shape that exhausted RAM, so it is gated behind `subagents.fanout` in
Dispatch config, capped by the same admission control as any other job, and
off unless the owner turns it on.

### 5. Admission control replaces the flat cap

`maxJobs` default rises from 1 to a value derived at admission time rather
than a constant: a job is admitted when free RAM exceeds
`MIN_FREE_RAM_BYTES` plus a per-job reserve. The flat cap remains as an upper
bound the owner can still set. Refusing on live free memory is strictly safer
than a constant that ignores machine size, which was ADR-0041's actual intent.

### 6. Worktree garbage collection

Worktrees under `.prism/dispatch/worktrees/` with no live job record and no
unmerged commits are pruned on `list_jobs` reap. Trees holding unmerged
commits are never pruned — they are reported.

### 7. Intent-based dispatch with announce-before-start

Server instructions stop keying Dispatch on literal phrases
(`"start working on …"`). They describe the *situation*: a request to change
code against a ticket or brief routes to `start_job`; a question about the
repository routes to Intelligence. The agent states what it is about to start
and what it will touch, then starts it — the user does not have to say a magic
phrase, and does not lose the ability to stop it.

## Options considered

### A — Leave delivery as-is, document the worktree (rejected)

The chat voice rules forbid speaking worktree paths, so "go read the worktree"
is not reachable advice. The user cannot get to the work.

### B — Have the agent commit its own work via shell (rejected)

Restores the shell that ADR-0041 removed, and makes the commit dependent on
the model remembering to make it. The supervisor already knows when the run
ended; it should do this.

### C — Copy artifacts back into the host repo (rejected)

Writes into the user's working tree without asking, and collides with whatever
the user is doing. A branch is the reviewable unit.

### D — Commit in the supervisor + checked summaries + supervisor-run
verification + in-process subagents (chosen)

## Consequences

- Positive: finished work is reachable by `git log <branch>`, reviewable as a
  diff, and survives worktree pruning. Summaries can no longer cite artifacts
  that were never written. Jobs carry a real pass/fail signal. Multi-part work
  decomposes without a second OS process.
- Negative: every job now produces a commit on its branch, including trivial
  ones, so branch cleanup matters more (§6 covers it). Supervisor-run
  verification adds wall-clock time to the tail of every job. In-process
  subagents raise a single worker's peak memory even though they add no
  process — the admission reserve in §5 is what absorbs that.
- Follow-ups: surface verification output in the extension; consider signing
  worker commits; revisit host fan-out defaults after soak on 16 GB+ machines.

## Compliance

- [x] Architecture docs — `docs/architecture/decisions.md`, `docs/mcp/dispatch.md`
- [x] Code — `@repo-prism/dispatch` worker-child commit + verify + GC;
  worker tool allowlist; MCP instructions
- [ ] Master Plan — product vertical, not an Intelligence milestone
