# Competitive landscape — September 2026

> Research note, not a plan. Written 2026-09-04 during M-067 to answer one
> question the owner raised: Trinity (ability.ai) appears to be the product
> Prism Dispatch was reaching for — what does it actually do, what else is in
> this market, and which of it belongs in Prism?
>
> Feeds [ADR-0052](../adr/0052-product-identity-and-iris.md) and
> [ADR-0053](../adr/0053-console-information-architecture.md).

## The finding in one paragraph

Trinity is not a competitor. It is a **business-agent fleet runtime** — the
unit of work is a long-lived agent-as-employee in a Docker container, with
cron schedules, Slack channels, per-agent cost budgets, RBAC and an org chart.
Prism Dispatch's unit of work is an **ephemeral job against a repository**,
running in the user's own checkout, on their own machine, with no network.
That difference invalidates roughly half of Trinity's feature list for us. The
other half is real, well-designed, and mostly about **observability and UX** —
which is precisely where Prism is weakest.

The genuine competitive set is a different column entirely: Conductor, Orca,
Nimbalyst, Superset, Vibe Kanban. Every one of them is "git worktrees + a
board + diff review". **None of them does analysis.** That is the gap Prism's
32 intelligence tools sit in, and it is the only durable advantage on this
page.

## Where each product sits

| Product | Unit of work | Runs where | Category |
|---|---|---|---|
| **Trinity** (ability.ai) | Long-lived agent | Docker container, own VPN/hardware | Business-agent fleet runtime |
| **Prism Dispatch** | Job against a repo | User's checkout or worktree, local | Repo intelligence + coding teammate |
| Conductor | Parallel session | macOS app, worktrees | Coding-session manager |
| Orca | Parallel session | Desktop + mobile, worktrees | "Agent development environment", MIT |
| Nimbalyst | Parallel session | Desktop + iOS, worktrees | Visual workspace, MIT |
| Vibe Kanban | Board task | Web app | Shared agent kanban; hosted path sunsetting |
| Superset | 100+ parallel agents | Local-first editor | Agent swarm workspace |
| CLI Agent Orchestrator (AWS) | tmux session | Local, 12 provider CLIs | Supervisor/worker delegation |
| Devin | Ticket | Cognition's cloud | Autonomous remote engineer |

Two observations worth keeping. The orchestrator column is crowded but
shallow, and several entrants are macOS-only or winding down — so the moat
there is not features, it is being the one that knows something about the code.
And Trinity is deep on *operations* (health, cost, approvals, audit,
retention, circuit breakers) because it has to run unattended for months.
Prism needs a fraction of that, but the specific patterns are well chosen.

## Trinity's console, as built

Read off their README and the Operations & Monitoring FAQ on 2026-09-04.
Recorded here because it is the reference for
[ADR-0053](../adr/0053-console-information-architecture.md).

- **One dashboard route, three switchable view modes**, persisted per browser.
  - **Timeline** (default) — Gantt. One row per agent, execution boxes in
    chronological order, colour-coded by *trigger type* (manual, scheduled,
    MCP, agent-triggered, public, paid). Per-row completion rate, cost and
    slot count. Time-range filter. Running executions animate live.
  - **Grid** — draggable tile canvas. Each agent is a card with avatar,
    runtime badge, inline Running/Autonomy toggles, live status chips.
    Fleet-level *info tiles* sit beside the agent tiles behind a `Tiles ▾`
    menu, with Tidy and Reset. An **org overlay** draws department zones and
    reporting-line arrows — stored as ordinary agent tags, so nothing new is
    persisted.
  - **List** — sortable, filterable rows, inline toggles, bulk tag actions.
- **Header** carries host telemetry (CPU/memory/disk) inline across all view
  modes, plus `/` type-to-filter.
- **Agent detail** — persistent header with current status and cost; an
  Overview tab owning the trend picture (daily counts by trigger, success
  rate, duration, context usage over 7/14/30 days), a health panel with
  uptime and latency, per-schedule rollups, footprint chips.
- **Operations** — a separate page, five tabs (Needs Response, Notifications,
  Health, Executions, Resolved) behind one unified badge that pulses only when
  something is critical.
- **Library** — one page, tabs for Agent Templates / Systems / Skills.

### Three patterns worth stealing outright

1. **"Completion is not quality."** Their fleet stat card was renamed from
   "Success rate" to "Completion" because a clean process exit says nothing
   about whether the work was good. Quality is a separate axis, written by the
   platform or a human and *never by the agent being graded*; an ungraded run
   has no score, which is different from scoring zero. This is the same
   principle as ADR-0029 and M-056, arrived at independently.
2. **A tile that refuses to claim an all-clear.** Their Recent-failures tile
   shows "No failures in 24h ✓" *only* when both the failure list and the
   24-hour total loaded and the fleet was enumerable. Otherwise it says which
   read failed. This is signal provenance applied to an empty state, and we
   have the same class of bug — the P-S7 gate found a rejected read still
   claiming to be loading.
3. **The blast-radius guard on destructive sweeps.** Any retention sweep that
   would delete more than 1,000 rows of one table refuses to run, raises an
   operator alarm, and waits for a single-use human approval bound to the
   exact retention window. Our own vocabulary, applied to their data layer.

## Feature-by-feature disposition

### Build — aligned, high value

| Trinity feature | Prism version | Note |
|---|---|---|
| Timeline / Grid / List views | Repos × jobs; waited-vs-worked bars | Our only view is one accordion list |
| Cost & tokens per execution | Already parsed and discarded | `claude-stream.ts` reads `modelUsage.inputTokens`; nothing persists it |
| Operator queue (typed question, options, expiry) | Generalise `needs_confirm` | Ours is hardcoded to two kinds; the worker cannot ask anything else |
| Completion ≠ quality | We have *better* evidence — real typecheck + tests | Trinity has no equivalent of `job-verify.ts` |
| Bounded loops with stop conditions | findings → jobs → verify → re-scan | See "the loop" below |
| Circuit breaker on auth failure | `blocked` / worker-auth already exists | Stops burning retries on an expired login |
| Retry + per-job timeout | Neither exists | Cheap reliability |
| Retention sweeps + blast-radius guard | `runs/`, `*.log.jsonl`, `notes/` grow unbounded | A live problem, not hypothetical |
| Typed reports (KPI/table/markdown/timeline) | `notes/*.md` → Findings tab | Typed artifacts are searchable and readable back over MCP |
| Append-only audit log | `AuditLogsPanel.tsx` exists | Dispatch edits the user's tree; an immutable record of every file touched is a safety feature |
| Agent-facing install runbook | We have `init` and `AGENTS.md` | "Tell your agent to install Prism and follow this runbook" — near-zero cost |
| Zero-install docs MCP (`ask_trinity`) | `prism-docs-mcp` over the Fumadocs site | Lets people evaluate with no install |
| Compatibility report (88 checks, 12 categories) | "Is this repo agent-ready?" | We ship four report tools already |

### Consider — needs its own decision

**Scheduling.** Cron, webhooks and event triggers. A nightly
`repository_health` re-scan is harmless and useful. Unattended *code edits* on
a timer are a different thing and sit badly with our review gates. Scope any
first cut to read-only analysis.

**Playbook library.** `JobRecord.playbook` already exists as an unused field
and `packages/plugin` already ships five skills. Trinity's multi-source skills
library with scheduled auto-sync is the mature form. Overlaps our plugin pack;
needs a decision on which one owns it.

**Fan-out.** We have in-process subagents plus a host fanout flag that is off.
Gated by the RAM budget work in ADR-0041.

### Skip — misaligned

Channel adapters (Slack/Telegram/WhatsApp), voice replies, outbound telephony,
per-agent Docker containers, PostgreSQL, multi-user RBAC/SSO/SCIM, public
agent links, x402 payments, the client-facing Workspace portal, A2A protocol,
ephemeral SSH, the file manager, the mobile PWA.

Most die on two of our own rules: ADR-0049 (Prism holds no third-party
credentials; connectors belong to the agent window) and the Console being
loopback-only, which rules out anything mobile or externally reachable without
a tunnel.

The file manager and SSH are worth noticing as a **strength, not a gap**: a
Dispatch job runs in the user's own checkout, so they already have the files
open in their editor. Trinity needs those surfaces because its agents live
somewhere the user cannot reach.

## What Prism has that this market does not

Recorded because it is the thing to build around, not a consolation.

Trinity's pitch is that state accumulates, so the agent improves every month.
Their asset is Cornelius — a Zettelkasten knowledge graph of company insight,
FAISS vectors plus a NetworkX graph. Impressive, and unrelated to code.

Our asset is better for our domain and already built: the index, the
dependency and knowledge graphs, landmarks, health findings, blast radius,
test impact, and `remember` memories. What is missing is the **loop**:

```text
repository_health → findings → queued jobs → worker fixes one
   → typecheck + tests verify → re-scan → finding count falls
```

That is a repo health burndown. Trinity has the loop machinery and no code
intelligence. Conductor, Orca, Nimbalyst and Vibe Kanban have the board and no
intelligence. Prism has intelligence, a board, a worker *and* real
verification. The loop is what turns 41 MCP tools into an outcome a user can
watch move.

It also solves a second-order problem: it gives the new Console views
something defensible to plot, which is the difference between charts and
decoration.

## Licence note

Trinity is Apache 2.0, so reading it is unencumbered. Take **patterns and
information architecture, not code or visual design**. Their Vue 3 + Tailwind
implementation is irrelevant to a React + `tokens.css` stack in any case.

## Sources

Read 2026-09-04:

- `ability.ai/trinity`, `ability.ai/cornelius`
- `github.com/abilityai/trinity` README, `docs/releases/0.9.0.md`
- `docs.ability.ai/faq/operations-and-monitoring` — the most useful single page
- `github.com/Abilityai/cornelius` README
- Category surveys: nimbalyst.com, superset.sh comparison pages;
  `awslabs/cli-agent-orchestrator`, `morapelker/hive`, `danhergir/seshions`
