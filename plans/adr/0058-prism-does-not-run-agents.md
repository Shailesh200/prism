# ADR-0058: Prism does not run agents — it is the safety layer agents run through

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-06) |
| Date | 2026-10-06 |
| Milestone | [M-079 Safety layer + Lenses](../archive/milestones/M-079_safety-layer.md) |
| Supersedes (job-runner parts) | [ADR-0035](./0035-dispatch-vertical.md), [ADR-0036](./0036-dispatch-auth-broker.md), [ADR-0038](./0038-cursor-worker-sdk-login.md), [ADR-0040](./0040-dispatch-worker-supervisor.md), [ADR-0041](./0041-dispatch-worker-resource-budget.md), [ADR-0042](./0042-dispatch-durable-handoff-and-subagents.md), [ADR-0044](./0044-dispatch-worker-backends.md), [ADR-0045](./0045-job-placement-checkout-first.md), [ADR-0046](./0046-claude-bg-worker-backend.md), [ADR-0047](./0047-job-queue-and-latency-budget.md), [ADR-0054](./0054-global-job-store.md) |
| Amends | [ADR-0043](./0043-agent-dashboard-hub.md) (no jobs board), [ADR-0057](./0057-prism-intelligence-unified-product.md) §2 Jobs + §6 vocabulary, program [`PROGRAM_prism-2.0.md`](../milestones/PROGRAM_prism-2.0.md) §8 |
| Keeps | [ADR-0004](./0004-core-only-integration-surface.md), [ADR-0049](./0049-host-delegated-integrations.md), [ADR-0050](./0050-prism-plugin-pack.md), [ADR-0055](./0055-guard-session-boundary.md), ADR-0056 (advisory edit hook) |

## Context

From M-064 to M-079, Prism grew a job runner: it spawned Cursor or Claude Code workers in the user's checkout or a worktree, with worker login, a supervisor, RAM budgets, a queue, a daemon board and Live Relay. Every one of those features competes with something the host already ships (Cursor background agents, Claude Code subagents, Codex). The MCP instructions themselves warn that a job can exhaust RAM.

The parts of Jobs that earned their place are not the runner:

- **Verification** — `resolveVerifyPlan` / `verifyJobWork` detect and run the repo's own checks.
- **Findings resolved by re-scan**, not by job status.
- **Memory across chats** — the working set.

Meanwhile the Intelligence tools only help when the model *chooses* to call them. Agents do not reliably choose, so most of Prism's value never reaches the edit.

An owner-run council (2026-10-06) agreed: drop the runner, keep verification, make Prism's output arrive without anyone deciding to call it, and prove it with evidence before building more.

## Decision

### 1. Prism does not run agents

No worker spawn, worker login, supervisor, queue, or live job board. The host's own agent does the work in the host's own chat. Prism holds no model and calls none.

### 2. Prism is the safety-and-context layer

The product is **a verdict on the change**: what it touched, what was proven, what was not. User-facing sentence: *“Your AI agent stops breaking things it can't see.”*

It is delivered by **host lifecycle hooks** shipped in the plugin pack (ADR-0050), Claude Code first:

| Hook | Prism does | Constraint |
|---|---|---|
| Session start | Tiny orientation + the workspace working set | Speaks only what fits a small budget |
| Before an edit | Path check against the off-limits / needs-sign-off lists | Deterministic; **warns**, blocks only when an Accepted ADR arms the veto (ADR-0056) |
| After an edit | Duplicate / boundary / high-blast warning | Off until reference precision lands (M-079 phase 6) |
| Stop | Runs `guard_session` + scoped checks itself; prints the **change receipt** | Hook runs the checks; it does not hand commands to the model |

Every hook appends to a local `~/.prism/hook-log`. Each hook has a latency budget (target under 300 ms excluding the checks the stop hook runs). A hook that has nothing concrete to say says nothing.

### 3. Verification leaves the job runner

`resolveVerifyPlan` and `verifyJobWork` move out of `packages/dispatch` into a checks module outside Core. Detecting and running the repo's commands is not analysis and stays out of `@repo-prism/core` (ADR-0004).

### 4. Jobs is switched off, then removed

1. Flag off by default; job tools answer with a one-line shim (“do this in this chat”) for one major.
2. Removed after that major: `start_job`, `list_jobs`, `job_control`, `job_logs`, `init`, `sleep`, `wake`, `dispatch_doctor`, `start_my_day`, worker / supervisor / queue code, the Dashboard Jobs tab. Findings move to **Impact & Guard**; `queue_finding` becomes a fix brief for the agent in the current chat.
3. Staying in the `dispatch` package until the package merge: memory (`remember`), skills (`use_skill`), Envelope ledger, working set, finding resolution, configure.

### 5. Smaller surface

Taught MCP surface shrinks to about five tools. The rest stay callable behind a flag or internal. Fewer schemas cost less context and improve tool choice.

### 6. Vocabulary

**Jobs** leaves the user-facing vocabulary. The slot goes to **Lenses** (ADR-0059). Budget: Prism, Iris, Envelope, Lenses.

### 7. Evidence gates

- Before more product code: a **replay benchmark** (M-079 phase 1) shows Prism's stop check catches at least one real regression an agent shipped, and records the false-alarm rate.
- After the change receipt ships: **kill test** — a stranger installs Prism, never calls a tool by hand, and a hook stops one real mistake. If not, stop and rethink rather than add features.

## Consequences

- Positive: Prism stops competing with hosts; RAM, login and worker-supervision bugs disappear; value reaches every session instead of only those where the model chose a tool.
- Negative: ~16 milestones of runner work are retired; hook APIs differ per host and move, so Claude Code ships first and Cursor follows; the frozen Live Relay code is parked in a git stash, not merged.
- Risk: hosts may absorb repo indexing and review. Prism competes on what hosts structurally will not build — local, deterministic, cross-host graphs; blast radius with provenance; one receipt in any host.

## Alternatives rejected

**Finish Live Relay and keep Jobs.** Rejected: competes with host agents and keeps the runner's cost.

**Keep tools only, improve instructions.** Rejected: agents still choose not to call them; that is the problem being solved.

**`check_change` returns commands for the model to run.** Rejected: same “only if the model decides” failure. The stop hook runs them.

**Prism calls an LLM to review.** Rejected: Prism is not an LLM product; the host's model does any thinking.

**Ship hooks for every host at once.** Rejected: hook APIs differ; one host first, measured, then the next.

## Compliance

- [x] Owner accepts this ADR (2026-10-06)
- [x] Master Plan §3 and §12 reflect the redirect
- [x] M-079 milestone doc approved (2026-10-06)
