# M-065 — Claude Code Worker

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-065-claude-code-worker` (from latest `main`) |
| Depends on | M-064 (Agent Dashboard Hub) |
| Unlocks | Codex worker (same backend seam) |
| Packages | `@repo-prism/dispatch`, `@repo-prism/mcp-server` |
| Amends | [ADR-0038](../adr/0038-cursor-worker-sdk-login.md) (worker login is per-backend) |
| Adds | [ADR-0044](../adr/0044-dispatch-worker-backends.md) |

## 1. Goal

`start_job` from a Claude Code host runs a **Claude Code** worker instead of a
Cursor agent — same supervision contract: own git worktree, no shell, no MCP,
append-only console, stall detection, Prism-side commit + checks, and
review-before-land. Cursor hosts keep the Cursor SDK worker.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-W1** | `WorkerPort` is Cursor-shaped; the runtime always spawns the Cursor SDK child. | Backend-neutral `WorkerBackend` (`"cursor" \| "claude"`) + `resolveWorkerBackend`: `configure` → `PRISM_WORKER` → MCP `clientInfo.name`. |
| **P-W2** | No Claude worker exists. | `claude-worker-child`: spawn `claude -p --bare --output-format stream-json` in the job worktree; allow read/edit/write/grep/glob/ls (+ `Task` when subagents on); deny `Bash`; no MCP servers; stream events into `run-log` + `run-state`. |
| **P-W3** | Finish logic (commit, verify, artifact audit) lives inside the Cursor child and must not drift. | Extract `worker-finish.ts`; both children call it. |
| **P-W4** | `init` assumes Cursor SDK login. | Per-backend init: Cursor keeps `Cursor.auth.login`; Claude checks the `claude` CLI on PATH + an existing sign-in, and says how to fix it. |
| **P-W5** | Resume needs a backend session handle. | Capture `session_id` from the stream; resume with `--resume`. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Codex worker | Next milestone on the same seam, once Claude stream/resume/deny-shell is proven |
| Gemini CLI / other hosts | After two backends exist |
| In-chat jobs ("do it in this Claude session") | Rejected — kills parallel jobs, stall, and the hub (ADR-0038 C) |
| Cloud workers | ADR-0040 C (rejected) |
| Slack DM on finish | Existing Slack connector follow-up |

## 4. Definition of Done

- [x] Only one milestone `In Progress`
- [x] `resolveWorkerBackend` picks `claude` for `claude-code` clients, `cursor` otherwise; `PRISM_WORKER` and `configure` override
- [x] Claude worker child runs `claude -p --bare` in the worktree with no Bash and no MCP; events land in the same JSONL console and run-state sidecar
- [x] Stall detection, `job_logs`, `needs_review`, and the hub board work unchanged for Claude jobs
- [x] Shared `worker-finish` (commit + typecheck/test + cited-path audit) used by both backends
- [x] `init` is backend-aware; Claude path never asks for `CURSOR_API_KEY`
- [x] Resume works via Claude `session_id`
- [x] ADR-0044 Accepted; dispatch docs (≤650 words), install docs, READMEs, reference docs updated
- [x] `bun run verify:milestone` green
- [x] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- [ADR-0044](../adr/0044-dispatch-worker-backends.md) Worker backends
- [ADR-0035](../adr/0035-dispatch-vertical.md) Dispatch vertical
- [ADR-0038](../adr/0038-cursor-worker-sdk-login.md) Cursor worker login
- [ADR-0040](../adr/0040-dispatch-worker-supervisor.md) Worker supervisor
- [ADR-0041](../adr/0041-dispatch-worker-resource-budget.md) Resource budget
- [ADR-0042](../adr/0042-dispatch-durable-handoff-and-subagents.md) Durable handoff
