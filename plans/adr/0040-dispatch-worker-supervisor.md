# ADR-0040: Dispatch worker supervisor (process isolation + live status)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-26 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch v1 (`dispatch/v1`) |
| Extends | [ADR-0035](./0035-dispatch-vertical.md), [ADR-0038](./0038-cursor-worker-sdk-login.md), [ADR-0039](./0039-dispatch-chat-voice.md) |

## Context

Parallel local workers are the Dispatch hero product: start a teammate on a
ticket, keep chatting, start another, see what each one is doing, and get a
result or a real error when it finishes.

The first implementation ran `Agent.create` + `agent.send` **inside the prism
MCP Node process** and never called `run.wait()`. That caused three failures:

1. **Laptop hang.** The Cursor agent loop burned CPU in the same process that
   must stay alive for chat. The worker’s Prism MCP also indexed a full git
   worktree copy of the repo (`PRISM_WORKSPACE=worktree`), so a second Prism
   index ran beside the IDE’s.
2. **Ghost “running” jobs.** In-flight handles lived in a process `Map`. MCP
   reload lost them; `jobs.json` still said running.
3. **No live status, no completion, no failure.** Chat could not see what a
   teammate was doing. MCP cannot push into an idle chat, and `start_job`
   returned before the run finished, so the host agent never received the
   result. Failures were either silent or a generic “unknown”.

Cursor’s Agents window is not a live dashboard for local SDK workers
(ADR-0039). A Canvas snapshot is not the product GUI. Live status for v1 is
**chat**: `list_jobs` / “where are we”, plus start-my-day.

## Decision

1. **Out-of-process supervisor.** `start_job` / resume spawn
   `packages/dispatch/dist/worker-child.js` as a detached Node process.
   The child owns `Agent.create`/`resume`, `send`, `run.stream()`, and
   **`run.wait()`**. The host MCP records `workerPid` and returns immediately.
   Cancel sends SIGTERM (then SIGKILL) to the process group. Workers survive
   MCP reload; the sidecar reconnects them.

2. **One job = one git worktree.** Unchanged: adopt a Cursor/Claude tree if
   one matches, otherwise `.prism/dispatch/worktrees/<id>`. Parallel jobs do
   not share a dirty tree without confirm. The agent’s `local.cwd` is that
   worktree so edits stay isolated.

3. **Live run sidecar.** `.prism/dispatch/runs/<jobId>.json` (throttled ~400ms)
   holds `pid`, `phase`, `lastActivity`, `resultSummary`, `errorMessage`,
   `gitSummary`. The child writes it. The host **reaps** on `list_jobs`,
   `start_my_day`, `start_job`, and `job_control`: dead pid → error
   (“teammate stopped unexpectedly”), `done`/`failed` → job record + inbox
   copy. Legacy in-process jobs with no pid are reaped if stale (>2 minutes).

4. **Hang budget.** Default `maxJobs` is **1** until a job cannot fill the
   disk or spawn a second Prism (see [ADR-0041](./0041-dispatch-worker-resource-budget.md)).
   Job agents do **not** attach Prism MCP. `local.settingSources` is `[]`.
   The host MCP does not call the Cursor SDK agent loop or `listRuns` on
   status checks.

5. **Completion and failure in chat.** MCP cannot inject a message into an
   idle transcript. Contract:
   - `start_job` returns immediately and tells the user to say **where are we**.
   - `list_jobs` leads with finished results and failures (git `--stat` plus
     truncated assistant text; `CursorAgentError` vs `result.status === "error"`
     mapped to user-safe copy — no API keys).
   - `start_my_day` has a **Just finished** section for the last 48 hours.
   - The host MCP also emits logging notifications when a sidecar reaches
     a terminal phase (best-effort; chat still uses where-are-we).

6. **Follow-ups while running.** A second `Agent.send` cannot join a child
   blocked on `wait()`. If the pid is alive, resume is a no-op (“already
   running”) and `attach_context` is stored as `pendingContext` for the next
   spawn. Pause/cancel kill the child.

## Options considered

### A — Keep the agent loop in the MCP process (rejected)

Returns immediately after `send()` without `wait()`, which is how the SDK
leaks the loop into the caller. This hung the host.

### B — Hold the `start_job` tool call open until `wait()` (rejected)

Blocks the host agent for the whole run. Parallel jobs and “keep chatting”
are the product.

### C — Cloud workers so they appear in Agents (rejected)

Local-first, ADR-0035. Cloud VMs are a different product.

### D — Detached child + sidecar + chat inbox (chosen)

## Consequences

- Positive: host MCP stays responsive; jobs run in isolated worktrees;
  “where are we” shows live activity; finished/failed copy lands in the next
  chat turn that calls `list_jobs` or `start_my_day`; MCP reload does not
  invent a running teammate.
- Negative: MCP still cannot push a line into an idle chat (host limitation).
  Users must say “where are we” (or start my day) to read the inbox. Each
  local Cursor agent is still heavy — the cap is 1 for a reason (ADR-0041).
- Follow-ups: a real jobs GUI (extension / MCP App) when the owner picks it
  up; optional IPC so `attach_context` can reach a live `wait()` without
  storing pending text. Resource budget: [ADR-0041](./0041-dispatch-worker-resource-budget.md).

## Compliance

- [x] Architecture docs — `docs/architecture/decisions.md`,
  `docs/mcp/dispatch.md`
- [x] Code — `@repo-prism/dispatch` worker-child + run sidecar; MCP
  instructions
- [ ] Master Plan — product vertical, not an Intelligence milestone
