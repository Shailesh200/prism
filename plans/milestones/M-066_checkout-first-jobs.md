# M-066 — Checkout-first Jobs + Claude-native Presence

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-066-checkout-first-jobs` (from latest `main`) |
| Depends on | M-065 (Claude Code Worker) |
| Unlocks | Codex worker (same backend seam), `claude-bg` mode if the spike lands |
| Packages | `@repo-prism/dispatch`, `@repo-prism/dispatch-hub`, `@repo-prism/mcp-server` |
| Amends | [ADR-0040](../adr/0040-dispatch-worker-supervisor.md), [ADR-0042](../adr/0042-dispatch-durable-handoff-and-subagents.md) (placement + commit defaults) |
| Adds | [ADR-0045](../adr/0045-job-placement-checkout-first.md); ADR-0046 (spike outcome) |

## 1. Goal

Two changes, one milestone (owner, 2026-09-01):

1. **Checkout-first placement.** A Prism job works in the user's current
   checkout on the current branch and leaves its edits **uncommitted** — like
   a pair programmer typed them. A separate worktree + job branch + commit
   happens only when the user asks for isolation ("on a branch", "keep my
   tree clean") or when a second job would collide with a running checkout
   job.
2. **Claude-native presence.** Jobs are visible without the loopback board:
   a Claude Code statusLine footer, a subagent tree on the hub dashboard, and
   — if the spike proves it — jobs as first-class `claude --bg` sessions in
   `/workflows` / agent view.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-P1** | Every job takes a worktree and auto-commits, even when the user wanted the edits right here. | `placement: "checkout"` default: worker cwd = the checkout, no commit on finish, review = uncommitted diff minus pre-existing changes. `placement: "worktree"` (or isolation intent) keeps today's behavior. |
| **P-P2** | Checkout jobs could mix with the user's uncommitted work silently. | Dirty tree at dispatch → `needsConfirm` ("the teammate will work alongside your changes"); confirm or redirect to a worktree. |
| **P-P3** | Two checkout jobs would collide. | One checkout job at a time; a concurrent job takes a worktree and chat says why. |
| **P-P4** | "commit it" must never sweep up the user's unrelated changes. | Dispatch snapshots dirty paths; the job's file set = changed-at-finish minus dirty-at-start; commit stages only that set, on explicit ask. |
| **P-P5** | Jobs are invisible inside Claude Code. | `prism-hub statusline` prints live job state; `configure` offers to wire `~/.claude/settings.json`. |
| **P-P6** | Subagent work is invisible. | Parse `parent_tool_use_id` (+ `--forward-subagent-text`) into the console; dashboard groups subagent activity under its parent. |
| **P-P7** | `/workflows` only lists supervisor-hosted sessions. | Time-boxed spike: `claude --bg` as a worker mode (ADR-0046 records the decision either way). |
| **P-P8** | Dispatch/finish notification must name the watch surface. | `start_job` message + instructions say "open /workflows" for claude-bg, board URL otherwise; completion = OS toast + statusLine flip + next-turn review ask. |
| **P-P9** | `configure` only accepted a fixed field list; anything else silently dropped. | Standing **preferences** (free-form wishes, surfaced in the standup); unknown keys become preferences loudly, never silently; `removePreference` drops. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Codex worker | Next milestone on the ADR-0044 seam |
| Gemini CLI | After two backends |
| `job_control` merge/discard actions | Chat instructs git explicitly; no new actions this milestone |
| Slack DM on finish | Existing Slack connector follow-up |
| IDE Jobs screen wire-up (app-shell → extension webview) | Separate surfaces cut |

## 4. Definition of Done

- [x] Only one milestone `In Progress`
- [x] Default job edits the current checkout, uncommitted; `configure` → `placement` restores worktree-first
- [x] Dirty tree at dispatch asks first; concurrent second job takes a worktree with an explanation
- [x] Checkout finish: no commit, checks run, review lists job-touched files (pre-existing changes excluded), "commit it" stages only those
- [x] Worktree placement (explicit or collision) keeps commit-on-finish + review-before-land exactly as today
- [x] `prism-hub statusline` prints live state; docs show the `settings.json` wiring
- [x] Dashboard groups subagent activity; `job_logs` shows subagent lines
- [x] Dispatch message names the watch surface per backend; completion notifies via OS + statusLine + next-turn
- [x] `configure` accepts standing preferences; unknown keys become preferences loudly, never silently
- [x] `bun run verify:milestone` green
- [x] Owner approval → commit → merge → Verified → snippet shared
- [ ] Spike answered + ADR-0046 — **deferred by owner 2026-09-01**: script + evidence table in `plans/notes/M-066-claude-bg-spike.md`; runs on the owner's Claude Code machine, ADR lands with the output. Does not gate the release.

## 5. References

- [ADR-0045](../adr/0045-job-placement-checkout-first.md) Checkout-first placement
- [ADR-0044](../adr/0044-dispatch-worker-backends.md) Worker backends
- [ADR-0040](../adr/0040-dispatch-worker-supervisor.md) Worker supervisor
- [ADR-0042](../adr/0042-dispatch-durable-handoff-and-subagents.md) Durable handoff
- [ADR-0043](../adr/0043-agent-dashboard-hub.md) Hub
