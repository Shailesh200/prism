# ADR-0046: `claude --bg` as a Dispatch worker backend — rejected

| Field | Value |
|---|---|
| Status | Accepted (decision: **reject**, with a stated re-open condition) |
| Date | 2026-09-02 |
| Decision makers | Owner, Architect |
| Related milestones | [M-066](../milestones/M-066_checkout-first-jobs.md) (spike raised), [M-067](../milestones/M-067_shippable-product.md) (spike run) |
| Relates to | [ADR-0044](./0044-dispatch-worker-backends.md), [ADR-0045](./0045-job-placement-checkout-first.md), [ADR-0047](./0047-job-queue-and-latency-budget.md) |

## Context

M-066 P-P7 asked whether Prism jobs could appear natively in Claude Code's
`/workflows` and agent view. They cannot as built: Prism runs `claude -p`
inside its own detached Node supervisor, so Claude's session supervisor never
learns the job exists. `claude --bg` starts a session that supervisor *does*
own, which would make Prism jobs first-class there.

The spike was deferred by the owner on 2026-09-01 pending a machine with
Claude Code installed. It was run on 2026-09-02 against **Claude Code
2.1.258**, signed in, on macOS 25.5.0.

## Evidence

| # | Question | Result |
|---|---|---|
| Q1 | Does `--bg` accept the worker contract flags? | **Pass.** `--bare`, `--permission-mode acceptEdits`, `--tools`, `--disallowedTools` are all accepted alongside `--bg`. |
| Q2 | Is the session id machine-readable? | **Pass.** `backgrounded · <id>` on stdout, and `claude agents --json` returns `id`, `sessionId`, `pid`, `cwd`, `kind`, `startedAt`, `status`, `state` without a TTY. |
| Q3 | Can the console be parsed for `job_logs`? | **Fail.** `claude logs <id>` returns a raw ANSI screen dump of an interactive TUI — cursor moves, colour codes, box drawing — not an event stream. There is no `stream-json` equivalent for a background session. |
| Q4 | Does a session reach a terminal state promptly? | **Fail.** Neither spike session ever ran. Both sat at `status: idle`/`waiting`, `state: blocked`, indefinitely. |
| Q5 | Do `stop` / `respawn` map onto cancel / resume? | **Moot**, given Q3 and Q4. `stop` does work. |

Two findings the spike was not looking for decided it.

**`--bg` starts an interactive REPL, not a one-shot run.** The positional
prompt is not executed; the session comes up at an empty prompt and waits. The
help text confirms the intent — `--bg` exists so a human can `claude attach`
later. There is no non-interactive way to hand a background session its work,
which is precisely what a dispatch worker must do.

**`--bg` relocates the work into its own worktree.** Without `--bare` the
session's cwd was
`<repo>/.claude/worktrees/wiggly-humming-shannon`, created by Claude Code, and
`claude stop` reported "worktree retained … run `claude rm` to remove worktree
and job state". That directly contradicts ADR-0045: Prism's default placement
is the user's own checkout, edits visible in their editor, nothing committed.
A backend that silently moves the work somewhere else is not the same product.

## Decision

**Reject** `claude --bg` as a Dispatch worker backend. Keep `claude -p` inside
the Prism supervisor (ADR-0044), which gives structured `stream-json` events,
a real prompt, and checkout placement.

Prism jobs will therefore **not** appear in Claude Code's `/workflows`. The
surfaces for job visibility stay the ones M-066 shipped and M-067 improves: the
statusLine footer, the OS notification, and the Prism Console.

No `workerBackend: "claude-bg"` is added. The ADR-0044 backend seam is
untouched and remains available for Codex and Gemini.

## Options Considered

### Option A — Reject, keep `claude -p` (chosen)

- Pros: keeps a parseable console, a working prompt, and ADR-0045 placement;
  no new backend to maintain for a surface we cannot fully drive.
- Cons: Prism jobs stay absent from `/workflows`; Claude users rely on the
  statusline and the Console instead.

### Option B — Adopt `--bg` anyway, drive it by attaching

- Pros: native `/workflows` presence.
- Cons: would require synthesising keystrokes into a TUI to deliver the prompt,
  and screen-scraping ANSI output to build a console. Both are brittle against
  any Claude Code release, and neither is a supported interface.

### Option C — Run both: `-p` for work, a stub `--bg` session for presence

- Pros: jobs visible in `/workflows`.
- Cons: two sessions per job, double the RAM on machines ADR-0041 already
  found tight, and a presence entry that lies — attaching to it would show an
  empty prompt, not the job.

## Re-open condition

Revisit if Claude Code gains **either** a non-interactive prompt for background
sessions (`--bg` accepting a prompt and running it) **or** a structured log
stream for them (`claude logs --json`). Q1 and Q2 already pass, so those two
gaps are the whole distance.

## Consequences

- Positive: no brittle TUI scraping; the Claude worker keeps the contract
  M-065 established; ADR-0045 placement holds on both backends.
- Negative: the `/workflows` integration the owner asked about is not
  achievable now, and P-S7's Claude smoke test drops its `--bg` cross-check.
- Note: the spike left one Claude-created worktree behind that `claude rm`
  declined to delete because it had uncommitted changes. Removed with the
  temp fixture. Worth knowing that background sessions can retain state after
  `stop`.

## Compliance

- [x] Updates Master Plan if roadmap impacted — M-067
- [x] Updates package README(s) if API impacted — none (no code change)
- [x] Linked from milestone doc — M-066, M-067
