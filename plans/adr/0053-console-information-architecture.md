# ADR-0053: A repository is the unit; the Console must be able to start work

| | |
|---|---|
| Status | Proposed |
| Date | 2026-09-04 |
| Milestone | M-068 / M-069 |
| Amends | [ADR-0043](./0043-agent-dashboard-hub.md), [ADR-0047](./0047-job-queue-and-latency-budget.md), [ADR-0048](./0048-prism-console-unification.md), [ADR-0051](./0051-motion-system.md) |
| Research | [`notes/COMPETITIVE_LANDSCAPE_2026-09.md`](../notes/COMPETITIVE_LANDSCAPE_2026-09.md) |

## Context

ADR-0048 unified two loopback UIs into one Console and adopted the orphaned
`JobsScreen`. That was the right consolidation and it shipped. What it did not
settle is the Console's information architecture, and three problems have
surfaced now that there is a single surface to look at.

**There is exactly one way to see the world.** `JobsScreen.tsx` renders a
single `<ul>` of expandable cards in a 1120px centered column, ordered by
`orderJobsForBoard`, filtered by four lane chips and a repo chip row. That is
a good reading surface for one job and it degrades badly past a handful, and
it has no answer at all for "what has this repository been doing this week".

**The Console cannot do the main thing.** `POST /api/jobs/:id/control` covers
pause, resume, cancel, confirm, commit and accept/reject files. There is **no
route that creates a job.** Every job must originate in a chat window, which
means the dashboard can only ever watch work and tidy up after it. This single
missing verb is the reason the Console reads as a log viewer rather than a
product, and it is the largest UX defect in the shipped surface.

**Findings dead-end.** The Findings tab renders `notes/*.md` through
`MarkdownDoc`. A user reads a finding Prism generated from structured
analysis, then leaves the Console, returns to chat, and re-describes it in
prose. The two halves of the product — Intelligence and Dispatch — never
touch, despite `repository_health` producing exactly the input `start_job`
wants.

Trinity's console is the reference for the first problem and is recorded in
the competitive note. The tempting move is to copy its three view modes and
its tile canvas wholesale. That collides with `UX_SIMPLICITY.md`, which sets a
hard complexity budget (≤1 primary canvas, ≤1 inspector, ≤3 persistent top
actions) and names "stat strips / health gauges" and "pill clusters" as
anti-patterns. That document is not stale and should not be quietly overruled;
it is the reason the Map is usable.

## Decision

### 1. The fleet unit is a repository; jobs are its executions

This is the mapping the rest of the ADR rests on. Trinity's long-lived *agent*
row maps to a Prism **repository**; its ephemeral *execution* box maps to a
Prism **job**.

That is not an analogy for convenience — it is what the data already says. The
hub registry at `~/.prism/hub/registry.json` tracks workspaces; `/api/repos`
returns them with job counts; `JobRecord` carries a workspace and jobs are
strictly per-repo. A repository is the thing that persists, accumulates
findings, has a health score, and can be healthy or sick. A job is a run
against it.

Crucially, this means we do **not** need Trinity's agent-fleet model to get
Trinity's views. We already have the long-lived row.

### 2. Three renderings of one canvas, never two canvases

The complexity budget holds, and the fleet views fit inside it once stated
correctly:

- **≤1 primary canvas.** Timeline, Board and List are three *renderings* of
  the same canvas, switched and never simultaneous. One is mounted at a time.
- **≤1 inspector.** The expanded job card stays the only inspector, unchanged
  and reused across all three renderings.
- **≤3 persistent top actions.** They become exactly: **New job**, **Search**,
  **View**. The current `Refresh` button is retired — the feed is already SSE
  with a poll fallback, so a manual refresh button is an admission that live
  updates are not trusted. Fix the trust, drop the button.
- **"New metrics only as map colouring, not new panels"** translates directly:
  a new metric earns a *visual encoding on an existing bar or row*, not a new
  tile. Info tiles are budgeted at two, and each must argue for itself (§7).

The current accordion is not deleted. It becomes the **Focus** rendering — the
best single-job reading surface we have, and the correct default when there is
one live job.

### 3. Timeline is the default, and it shows waited versus worked

Timeline renders repositories as rows and jobs as bars in time, coloured by
`job.source`, which already exists on the record.

Each bar is drawn as **two segments — waited and worked** — from the four
timestamps P-S1 split apart (`createdAt`, `queuedAt`, `startedAt`,
`finishedAt`). This is the whole reason to build Timeline before Board.
ADR-0047 fought to make the clock honest and the result currently surfaces in
a `title` tooltip on one line of `JobFacts`. A queue gate that held a job for
three minutes and a worker that took twelve are different facts about
different problems, and a single bar hides that distinction while two segments
give it away at a glance.

No competitor draws this, because none of them separated the stamps.

The rules from ADR-0051 §10 carry over without change: a stage with no stamp
is drawn unreached and never given a plausible time; a terminal record with no
`finishedAt` is settled, not perpetually current.

### 4. The Console can start a job

`POST /api/jobs` is added, and a compose surface with it: title, PRD,
placement, backend, model, and a **Playbook** picker.

Three constraints, all inherited rather than new:

- It goes through the same `runtime.ts` path as the MCP tool, including the
  500ms latency budget of ADR-0047 and the gate sequence in `queue.ts`. The
  Console does not get a second, more permissive way to start work.
- Placement defaults to `checkout` per ADR-0045, and the dirty-tree gate still
  produces a visible `needs_confirm` job rather than a modal that blocks.
- `JobRecord.playbook` already exists and is unused. The picker reads the
  plugin pack's skills (ADR-0050) rather than introducing a second registry.

`job.source` gains a value for Console-originated jobs, which is also what
makes Timeline's colour coding say something worth knowing.

### 5. A finding is a handoff, not a document

Every finding gets one primary action: hand it to a teammate. The job is
pre-filled from the structured finding — the affected paths, the blast radius
already computed, the tests `test_impact` already named — not from the user
retyping prose.

This is the join between the two halves of the product, and it is worth more
than any view. It is also the precondition for the burndown loop the
competitive note identifies as the durable advantage, since a loop needs
findings to become jobs mechanically rather than by hand.

### 6. Attention is one inbox behind one badge

`needs_confirm` and `waiting_on_you` are hardcoded to two gate kinds
(`dirty-checkout`, `path-overlap`) in `JobConfirm`, and a worker that needs to
ask anything else has no way to. That is generalised to a typed request — a
question, options, optional expiry — surfaced in a single inbox.

One badge, and **it pulses only when something is genuinely blocking.** A
badge that pulses for finished work teaches people to ignore it, which is the
"notification noise" axis `DESIGN_SYSTEM.md` rejects. Finished-and-unreviewed
is a count, not an alarm.

### 7. A tile must be able to prove its claim

Two info tiles ship, and both are held to the empty-state honesty rule:

**Recent failures** shows "no failures" **only** when it can positively
confirm one — the failure list read, the window total read, and the workspace
list enumerable. If any read failed it says which, rather than rendering a
reassuring zero. Trinity arrived at this independently and it is the same
principle as ADR-0029 signal provenance and M-056 number integrity; the P-S7
gate found the identical class of bug in a subtitle that promised to be
loading repositories it would never be allowed to read.

**Dispatch summary** shows live, blocked and waiting counts, which are
directly countable from the snapshot.

Anything beyond these two needs a new decision. "It looked empty" is not an
argument for a tile.

### 8. A nav rail, and no second one

The four top tabs become a persistent left rail, and the main pane goes
full-bleed rather than 1120px centered, because a Timeline of repositories
over two weeks does not fit in a reading column.

The rail is `AppSidebar` from `@repo-prism/app-shell`, which already exists
and already has a `jobs` view. ADR-0048's whole argument was that a complete
component was mounted nowhere while a lesser one shipped; building a second
sidebar for the Console would repeat that mistake in the same package.

### 9. Charts are hand-rolled SVG primitives, and no chart precedes its data

Chart primitives — `Sparkline`, `GanttRow`, `AreaChart`, `Gauge` — are
extracted into `packages/ui` from the hand-rolled SVG already working in
`OverviewScreen.tsx` and `TrendsScreen.tsx`.

**No charting library.** M-050 was spent on frontend bundle weight and
ADR-0051 declined to add ~70kB of tween engine to the webview for behaviour
CSS gives away; adding d3 or recharts to draw a bar and a line would undo both
arguments for less benefit. The SVG we already ship is proof the primitives
are sufficient.

And the sequencing rule: **a chart ships after the metric it plots is
persisted and defensible, never before.** Cost and token counts are the
concrete case — `claude-stream.ts` parses `modelUsage.inputTokens` today and
discards it, so a cost axis on Timeline is not buildable until the record
carries it. Drawing an estimate would be the exact failure M-056 exists to
prevent.

## Consequences

- The Console becomes a place work starts, not only a place work is watched.
  This is the intended change and the reason the milestone exists.
- `POST /api/jobs` is a write endpoint on a loopback daemon. The token and
  origin allowlist in `auth.ts` already cover it, and it creates nothing the
  MCP tool cannot already create, so the threat surface is unchanged in kind.
- Three renderings is three sets of empty, loading and error states.
  `JobsScreen`'s existing states are per-screen and will need lifting.
- Retiring `Refresh` is a commitment to the SSE path being trustworthy. If it
  is not, that is a bug to fix rather than a button to keep.
- `AppSidebar` becomes shared chrome between the IDE and the Console, so a
  change to it now touches two shipping surfaces.
- **Planned M-062 (UI Actionability) overlaps this.** Its scope — "D-9 IA
  merge, dead-end fixes, shared table primitives" — is a subset of §5, §8 and
  §9. Per `AGENTS.md`, that conflict is reconciled in the plan rather than
  discovered in code: M-062 should be absorbed or re-scoped before M-069
  starts, and the owner decides which.

## Alternatives rejected

**Board as the default view.** Trinity defaults to Timeline and it is the
right call for the same reason here: a tile canvas answers "what exists",
which a user already knows, while Timeline answers "what happened", which they
do not. Board also cannot show the waited/worked split that is our best
original idea.

**The org overlay** (department zones, reporting-line arrows, stored as tags).
Genuinely clever, and meaningless here. Repositories do not report to each
other, and inventing a hierarchy to draw one would be decoration.

**Drag-to-arrange tiles with Tidy and Reset.** Per-browser persisted layout is
real work for a surface with one user and, typically, under ten repositories.
Revisit if someone registers thirty.

**A cost axis now.** Rejected under §9 until tokens are persisted. Named
explicitly because it is the most tempting thing on Trinity's dashboard and
the easiest to fake.

**Keep the accordion as the only view and just add charts to it.** The
cheapest option, and it fails the actual complaint: the problem is not that
the list lacks decoration, it is that the list cannot express time or
comparison, and cannot start work.

**A separate Operations page** (Trinity's five-tab split). Rejected as
premature. Their tabs exist because a fleet of containers generates health,
notification, execution and approval streams that genuinely differ. Ours would
be one inbox and one list wearing five hats, and M-067's rough-edge note
already recorded that one board is enough until multi-step runs ship.

**Remote or mobile access.** Out under ADR-0048's loopback model. Noted only
because Trinity's mobile PWA is the feature owners ask for first, and the
answer is a tunnel we are not going to ship.
