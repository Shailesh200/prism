# Console Fleet — visual lock (Trinity-matched)

| Field | Value |
|---|---|
| Status | **LOCKED for M-068** — implement against this file |
| Date | 2026-09-04 |
| Tokens | `packages/ui/src/tokens.css` (UXPilot dark, ADR-0014) |
| IA | [ADR-0053](../adr/0053-console-information-architecture.md) |
| Identity | [ADR-0052](../adr/0052-product-identity-and-iris.md) |
| Research | [`notes/COMPETITIVE_LANDSCAPE_2026-09.md`](../notes/COMPETITIVE_LANDSCAPE_2026-09.md) |
| Reference product | Trinity v0.9 dashboard (`ability.ai/trinity`) — **IA and density, not pixels or Vue** |

This is the mockup lock for the Prism Console. If a PR ships a Console screen
that does not match a frame below, it is unfinished — not a taste difference.

Trinity is the reference for **how a fleet console feels**: one home, three
ways to look at it, a tile you can read in two seconds, a timeline that shows
time, a list you can sort, a badge that only pulses when something is blocked.
Prism tokens, type, and voice stay ours. Do not copy Trinity's wordmark,
avatars, org-chart overlay, or Vue/Tailwind skin.

**This lock is for a sellable product, not a milestone demo.** The market
work exists because UI/UX is the gap. Conductor, Orca, Nimbalyst and Trinity
are what buyers open and judge in thirty seconds. A Console that “has the
views” but still looks like a developer dashboard is a failed milestone,
even if every phase test is green. The test at the end of M-068 is: would
we put a screenshot of this on `prismhq.in` and ask someone to pay? If not,
it is not done.

---

## 1. Mapping (Trinity → Prism)

| Trinity | Prism | Why |
|---|---|---|
| Long-lived **agent** | **Repository** (hub registry workspace) | The thing that persists and has health |
| Ephemeral **execution** | **Job** | A run against that repository |
| Dashboard `/` | Console `#/dashboard` (default; old `#/jobs` redirects here) | One home |
| Timeline / Grid / List toggle | Pulse / Board / List toggle | Same three renderings, one canvas |
| Agent detail Overview | Job Focus + repo Overview drawer | Inspector, not a second app |
| Operations (Needs Response) | **Attention** (`#/attention`) | One inbox |
| Operations badge | Attention badge on the rail | Pulses only when blocking |
| Library | Playbooks in the compose drawer | No extra top-level page |
| Host CPU/mem/disk header | Host strip (this machine) | Same place, local numbers |
| `/` type-to-filter | `/` type-to-filter | Across Pulse, Board, List |
| Cost on a tile | **Duration + verification** this milestone | Cost ships when tokens persist (out of scope here) |
| Agent avatar | **Repo mark** — first letter in a 28px tile, teal hairline. No face. | `DESIGN_SYSTEM.md` forbids avatars |
| Run / Autonomy toggles | **Pause / Resume** on a live job; Board tile has no fake autonomy switch | We do not have unattended loops yet |
| Org zones + reporting arrows | **Not built** | Repos do not report to each other |
| Brain Orb | **Spectrum** on `#/iris` — `RepositoryMapView`, not a 3D toy | Same artifact as the website hero |

---

## 2. What “as good as Trinity” means (acceptance bar)

A reviewer who has used Trinity should recognise the Console in under ten
seconds. Concrete, not vibes:

1. **The home is a fleet, not a log.** Opening `http://prismhq.localhost:17330`
   shows Pulse (Live / Needs you / Settled) or Board, not a 1120px accordion of
   job cards. Today's `JobsScreen` list is Focus, reached by selecting a job.
2. **Three view modes, one switch, persisted.** Segmented control, top-right of
   the dashboard toolbar, default Pulse, last choice in `localStorage`.
3. **A tile is a status instrument.** Board tile shows: repo name, latest job
   status (Done / Failed / Running — not verify), last activity line, sparkline
   cropped to the jobs in range, live-job count. Readable at 280px wide.
4. **Pulse is the default canvas.** Live / Needs you / Settled sections plus an idle-repo strip. Dual wait/work *meters* on live, needs-you, and settled cards (not a Gantt). Hover a wait/work segment for the queued/started/finished stamp. Cancelled uses a muted left notch and meter, not brand green. Click a card for Focus. Time-range control: Grafana-style picker (absolute from/to on the left, preset list on the right). Presets **30m / 1h / 6h / 12h / 24h / 7d / All**, after the view switch. Range filters Pulse, Board tiles/counts, and List.
5. **List is a dense table.** Sortable columns, `/` filter, inline Pause and
   Open. No card chrome.
6. **You can start work here.** A primary **New job** button opens a compose
   drawer. `POST /api/jobs` exists. Chat is no longer the only door.
7. **Attention is one place.** Needs-your-OK gates and `waiting_on_you` live
   on `#/attention`. The rail badge is that count. It does not pulse for
   finished-and-unreviewed work.
8. **Chrome is full-bleed.** Left rail ~224px (`--prism-sidebar-w`), main pane
   fills the rest. The 1120px centered reading column is retired on Dashboard,
   Attention, and Spectrum. Findings markdown may stay measure-constrained.
9. **Scanline, not skeleton soup.** While a view's first snapshot loads, a
   single horizontal scanline walks the canvas (CSS, ADR-0051 vocabulary,
   zeroed under reduced motion). Per-row skeletons are allowed *after* the
   first snapshot for rows still resolving.

If any of those nine is missing, the milestone is not done.

### 2a. Sellable-product craft (the other half of “done”)

Views without craft are a side project. Every surface in this lock also has
to clear this bar. A missing item here is a defect, not polish-later.

| Craft | Production rule |
|---|---|
| **Screenshot test** | Dashboard (Pulse and Board), Attention, Iris, and compose must each be homepage-safe: no debug strings, no raw `job-<hex>`, no worktree paths, no `TODO`, no lorem, no overflow, no clipped labels. ADR-0039 voice applies to the UI the same way it applies to chat. |
| **One type system** | Display / title / body / meta / mono only — the `tokens.css` scale. No one-off `13.5px` or `font-weight: 550`. Titles align across routes (Dashboard “Jobs” and Iris “Iris” are the same size and weight). |
| **One spacing rhythm** | `xs/sm/md/lg/xl` only. Toolbar, tile padding, row height and inspector padding are specified in §3–§8 and must match, not “look close”. |
| **Every control has four states** | Rest, hover, active/pressed, disabled, plus focus-visible. Primary **New job** has a hover that is not a brightness hack (use `brand-strong`). Disabled compose-submit explains why (`Title is required`, not greying the button in silence). |
| **Every route has four data states** | Loading (scanline), empty (designed, not an icon dump), error (named failure + last-good if any), ready. “Blank page” and “spinner forever” are ship blockers. |
| **Copy is product copy** | Short, technical, no emoji, no exclamation marketing. Empty states tell the next action. Errors name the read that failed. Iris never says “I”. |
| **Keyboard** | `/` focuses filter. `Esc` closes Focus, compose, and menus. `j` / `k` move List rows. Enter opens Focus. Tab order is brand → rail → toolbar → canvas → inspector. No focus trap except in compose and dialogs. |
| **Focus is visible** | `:focus-visible` uses a 2px brand ring. Mouse users do not see a ring on click. |
| **Live regions** | Attention badge changes and compose “Queued …” are announced (`aria-live="polite"`). The scanline is `aria-hidden`. |
| **Hit targets** | Toolbar and rail items ≥ 32px. Job lanes 28px tall; colour bars 14px high and ≥ 8px wide; titles live in the label column. List rows 40px. No 12px icon-only delete without a 32px hit box. |
| **Density that looks paid-for** | Hairlines, not drop shadows. Tiles sit on a consistent baseline grid. Sparklines are optically aligned (same height, same right edge) across every Board tile. Pulse meters split waited vs worked; they are not a fake Gantt. |
| **Motion is expensive-feeling, not busy** | Scanline once. View crossfade 200ms. Live pulse only on live things. No layout jump when a job arrives — new bars ease in (`prism-job-enter` or equivalent, capped stagger). Reduced motion: instant, no pulse, no scanline. |
| **Toasts** | One at a time, 180ms in, auto-dismiss 4s, never cover the primary button. Success and failure look different. |
| **Website and Console are one product** | Same mark, same teal, same dark canvas, same wordmark. A visitor who installs from `prismhq.in` and opens the Console must not feel they entered a different app. Spectrum is the proof. |
| **Half-width and laptop** | §14 breakpoints are verified by hand, not only at 1440. A 1280×800 laptop and a 900px IDE webview are first-class. |
| **No leftover prototype chrome** | No “Refresh” (ADR-0053). No “v0”, “beta”, “WIP”, placeholder avatars, or unmatched footer links. Footer links resolve. |

Owner review of M-068 is a **visual review**, not a feature checklist. The
P-C9 report includes screenshots of the four homepage-safe surfaces.

---

## 3. Shell

Full viewport. Dark canvas `#0a0e1a`. No second visual language.

```
┌─ 56px top bar ──────────────────────────────────────────────────────────────┐
│ [mark] Prism Dispatch  CPU 12% · MEM 4.2G · DSK 41%                         │
├─ 224px rail ─┬─ main ───────────────────────────────────────────────────────┤
│              │ toolbar (changes with route)                                 │
│  Dashboard   │──────────────────────────────────────────────────────────────│
│  Attention 3 │                                                              │
│  Findings    │  view body — full bleed, 24px padding                        │
│  Iris        │                                                              │
│  Settings    │                                                              │
│              │                                                              │
│              ├──────────────────────────────────────────────────────────────│
│              │ footer: version · docs · website                             │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

### Top bar

| Piece | Spec |
|---|---|
| Brand | Existing mark 22×22, radius 6. Wordmark: **Prism** Inter 700 16px `#fff` + **Dispatch** Iowan/Palatino italic 17px `--prism-brand`. Do not restyle. |
| Host strip | Left cluster with the wordmark. 12px mono, muted ink. `CPU {n}%` · `MEM {used}G` (used only) · `DSK {pct}%`. Right cluster: **Search** + primary **New job**. Probe: `os.cpus` / `os.freemem` / `os.totalmem` / `statfs`. Refresh ≤5s. If a probe fails, that segment reads `—` and does not invent a number (ADR-0029). |
| Help | `?` opens the `/` filter hint and a one-line “New job starts a teammate in this repo”. |

No Trinity-style global nav across the top. Routes live on the rail. Trinity
puts Dashboard / Operations / Library on top because it is a multi-user app
with many pages. We have five routes.

### Rail

Reuse `AppSidebar` from `@repo-prism/app-shell` (`variant="full"`). Console
items only — do not dump the IDE's Map/DNA/Blast list into the Console.

| Item | Route | Badge |
|---|---|---|
| Dashboard | `#/dashboard` | — |
| Attention | `#/attention` | Count of blocking items. Pulses (`job-pulse`, 1.6s) only if any item is `needs_confirm` or `waiting_on_you`. |
| Findings | `#/findings` | — |
| Iris | `#/iris` | — |
| Settings | `#/settings` | — |

Legacy hashes: `#/jobs` → Dashboard, `#/intelligence` → Iris, `#/workflows` →
Attention. Keep those redirects forever; bookmarks exist.

Active item: teal hairline + `--prism-brand` label, same as today's
`console__tab--on`.

### Dashboard toolbar (shared by Pulse, Board, List)

```
Host bar:  [mark Prism Dispatch]  CPU · MEM · DSK          [ Filter… ]  [ New job ]

Canvas:    ◉ Pulse  ▦ Board  ≡ List          [from — to | Last 1 hour ▾]  Repos ▾  ↻
```

| Control | Spec |
|---|---|
| **New job** | Primary teal button on the host bar. Opens compose drawer (§8). |
| **Filter** | Host-bar `SearchableInput`. Placeholder `Filter repos and jobs`. Focus on `/` when no field is focused (Trinity). Filters Pulse, Board, and List. |
| **Range** | Grafana-style picker after the view switch. Default **1h**. Left of the trigger: absolute from/to. Right: preset label. Dropdown: from/to + Apply on the left, preset list on the right (**Last 30 minutes / 1 hour / 6 hours / 12 hours / 24 hours / 7 days / All time**). Applies to Pulse, Board (tiles, counts, Dispatch, failures), and List. |
| **View switch** | Segmented control, left of the canvas toolbar. Icons + labels. Persist `prism.console.view` = `timeline` \| `board` \| `list`. Default Pulse. Range, repo, and refresh stay on the right. |
| **Repo filter** | Right of range. `All repos` or one workspace. |

Three persistent top actions, per `UX_SIMPLICITY.md` and ADR-0053 §2:
**New job**, **Search**, **View**. Range is a modifier on the canvas, not a
fourth action.

---

## 4. Pulse (default) — operations desk

Trinity's Timeline is a Gantt because agents are long-lived. Prism jobs are
sparse and ephemeral (a handful of repos, 0–2 live). Pulse is the default
canvas: three sections and an idle strip. It is not a Gantt.

```
LIVE
  [P] Ship gate · prism                         Running  ⋯
  waited 48s ████░░░░  worked 14m
  bun run typecheck

NEEDS YOU
  [W] Landing copy · website             Awaiting approval  ⋯
  The checkout has uncommitted changes.

SETTLED
  Audit · prism                                      Done  ⋯
  Indexed 14 packages

  Landing copy · website                       Cancelled  ⋯
  The teammate stopped without reporting a result.

Idle · website · tmp · m012-features
```

### Sections

| Section | Who | Card |
|---|---|---|
| **Live** | `queued` / `ready` / `booting` / `running` | Large card: mark, title, repo, status badge, dual wait/work meter, mono `lastActivity` snippet. Actions live in a top-right **⋯** menu (`JobActions`, same as List). Billed in/out is Focus-only — not on Pulse |
| **Needs you** | `needs_confirm` / `waiting_on_you` / `paused` / `blocked` | Gate card: `confirm.question` (or the stalled/paused copy). Same **⋯** menu (Start anyway / Resume / Cancel / View details). Never the Attention stretch rule (`.attention-card__actions .prism-btn { flex: 1 }`) |
| **Settled** | everything else in range | Compact row. Badge is `jobDisplayLabel` (Done / Cancelled / Failed), not Success/Failure. Copy is `errorMessage` / `lastActivity` / `resultSummary`. Wait/work meter with hover timestamps, same as Live. Cancelled is muted, not brand-green. Checks stay a **⋯** action (`Retry verification`) and in Focus — never the card status or message. Retry / reverify / finding / instruct enqueue a **child job** (`parentJobId`) rather than mutating the parent |

Idle strip: registered repos with no jobs in the selected range, as ghost **sm** chips. Click → existing `onOpenRepo` / `?repo=` filter.

### Wait / work meters

Same stamps as ADR-0047 (`queuedAt` / `startedAt` / `finishedAt`). Waited / queued = `--prism-amber`; worked = `--prism-brand`. Failed
and cancelled jobs keep those wait/work colours and add a short outcome cap
(rose / ink-muted) so the bar still reads as queued → working → result. Running
(`running` / `booting` / `ready`): a 2px brand cap on the work segment
breathes. Settled and needs-you cards show the same meter, without the live
cap. Hover a segment for the queued / started / finished datetime. Queued and
gated cards do not pulse. Reduced motion: static cap.

Colour-by-source is a 3px left notch: chat / console / finding — tokens, not a
rainbow.

### Interaction

- Click card body: Focus inspector on the right (**75vw**, `Drawer` size `xl`) —
  today's expanded job card without the inner accordion title row (`JobFacts`,
  3-column meta, teammate instructions, review, `JobConsole`). This is the
  ≤1 inspector rule. Do not build a second inspector. No ⋯ in the Focus header.
- **⋯** (Pulse/List/Attention/Board list, same `DropdownMenu`): **Copy job link**, View details, then either **Add instruction** (`running`) or **Start New job from this finding** (every other status). Pause / Resume (including Failed) / Start anyway / Cancel / Retry / Retry verification / Delete follow. No sm buttons on the Pulse card.
- Focus footer is a right-aligned `FocusJobBar` of icon-only buttons. Hover
  shows the name plus what it does: **Copy**, **Start new job**, **Findings**,
  **Verification**, **Job**, **Delete**, **Resume** (play icon). Same
  `primary` / `secondary` / `tertiary` / `warning` / `danger` tones. **Retry
  job** is unfilled brand text (icon in `--prism-brand`, no fill). Pause /
  Cancel / Start anyway stay icon-only when those states apply.
- **Start New job from this finding** opens compose with playbook **From a
  finding**, that job selected (even if it left no write-up), and the title
  pre-filled. The queued job stores `parentJobId` + `origin: finding`.
- Failed-check **Retry verification** and error/cancelled **Retry job** enqueue a child job (`parentJobId`, `origin: retry` \| `reverify`). The parent row stays. Focus shows a Related jobs tree; click opens that job's Focus.
- Teammate instructions replace Brief / Save brief. **Start child job** stays
  disabled until the text differs from the current instructions. Helper and
  shortcut share one line: “Update the instruction and start a child job. Esc
  to close · ⌘↵ to start”. ⌘↵ starts the child (`origin: instruct`). There is
  no Save.
- Platform meta is `hostClientLabel` (Cursor, VS Code, Prism Console, Kilo, Roo, Codex, …), not the workspace name.
- Gate verbs call the same `port.control` Attention uses (`confirm` /
  `resume` / `cancel`). Pause calls `pause`.

### Empty / loading

- No repos: first-run panel (§10), not “No jobs yet — ask Prism”.
- Repos but no jobs in range: lede + idle strip. Do not draw empty Gantt
  tracks that say `No data available`.
- First load: existing `.fleet-scan` scanline.

---

## 5. Board — Trinity's Grid tiles

Trinity: avatar, runtime badge, Running/Autonomy toggles, status chips,
sparklines, cost & success, info tiles, Tiles menu, drag-to-arrange, org overlay.

Prism copies the **tile-as-instrument** and the **two info tiles**. Skips drag,
org overlay, autonomy, cost.

```
┌─ Tiles ▾ ──────────────────────────────────────────────────────┐
│ ┌─ prism ─────────────┐ ┌─ website ───────────┐ ┌─ Dispatch ──┐ │
│ │ ● live              │ │ ○ idle              │ │ 4 live      │ │
│ │ 2 running · 1 wait  │ │ 0 running           │ │ 1 blocked   │ │
│ │ ▁▂▃▅▃▄▆▅  14d       │ │ ▂▁▁▃▅▄▂▁  14d       │ │ 2 waiting   │ │
│ │ last: ship-gate-…   │ │ last: 3h ago        │ │             │ │
│ │ verify pass         │ │ verify —            │ └─────────────┘ │
│ └─────────────────────┘ └─────────────────────┘ ┌─ Failures ──┐ │
│                                                 │ 24h: 1      │ │
│                                                 │ ship-gate…  │ │
│                                                 └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Repo tile (280–320px, min-height 168px, radius 12px, panel fill, 1px line)

```
[P]  prism                         Done
     2 running · 1 waiting
     last  ship-gate-smoke · 4m ago
     ▁▂▃▅▃▄▆▅▇▅▄▃
```

| Element | Spec |
|---|---|
| Mark | 28×28, radius 8, `--prism-tile`, letter in `--prism-brand` 13px 650 |
| Name | 14px 600, one line, ellipsis |
| State | Latest job status (`Done` / `Failed` / `Running` / …), not verify Success/Failure |
| Counts | 12px muted. Exact integers from the snapshot. |
| Last | Job title 13px + relative time. If none: `No jobs yet`. |
| Sparkline | `Sparkline` primitive, job-count buckets over the jobs in the selected range, cropped to that span so empty filter padding does not flatten the right edge. |

Click tile → Pulse filtered to that repo, Focus closed. Double-click or
Enter → Focus on the latest live job, or the latest settled job if none live.

No Run/Autonomy switches on the tile. Pause lives on the job in Focus and List.

### Info tiles (same chassis, `--prism-canvas-alt` fill so they read as instruments)

**Dispatch summary.** Live, blocked, waiting — three numbers. A number renders
only from a successful `/api/jobs` snapshot. On failure the tile says
`Couldn't read jobs` and keeps the last good numbers labelled `as of {time}`.

**Recent failures.** Latest failed jobs in the selected range + the count.
Stacked rose chips (Calendar events), three visible, **+N more** for the rest.
Not a bullet list. Shows `No failures in this range` **only** when the failure
list loaded and the workspace list is enumerable (Trinity's honesty rule,
written into ADR-0053 §7). Otherwise name the read that failed.

### Tiles menu

`Tiles ▾` top-right of the Board (under the toolbar). Show/hide the two info
tiles. Persist `prism.console.tiles`. No drag. No Tidy. No Reset-to-org-chart.
Auto-flow: `repeat(auto-fill, minmax(280px, 1fr))`, gap 16px.

---

## 6. List — Trinity's roster

Trinity: sortable filterable rows, inline toggles, bulk tags.

Prism: jobs (not repos) as the rows — this is the power-user index.

| Column | Width | Sort |
|---|---|---|
| Status | 120 | Yes (board rank) |
| Title | flex | Yes |
| Repo | 160 | Yes |
| Waited | 80 | Yes |
| Worked | 80 | Yes |
| Tokens | 140 | Yes (billed total; live occupancy + in/out) |
| Verify | 80 | Yes |
| When | 120 | Yes (default desc) |
| | 88 | Pause / Open — not sortable |

Row height 40px. Hairline dividers. Hover `--prism-tile`. Selected row opens
Focus. `/` filter matches title, repo, status label.

No bulk tag actions. We have no tags.

---

## 7. Focus — today's job card, as inspector

Focus is a **75vw** right drawer (`Drawer` size `xl`). The inner accordion
title row, disclose chevron, branch-in-header, trash, and ⋯ are gone — the
drawer title is the job. Meta is a 3-column `dl`: Status, Triggered, Platform,
Time, Branch, Agent, Model, then Context and Tokens (occupancy and billed
in/out). Empty slots read "—" until the worker reports usage. Horizontal rules sit between rows only — no vertical rules, no line on
the first or last edge. The lifecycle rail spans that inspector width; first
label left, last label right. Phase colours: Accepted `--prism-violet`,
Queued `--prism-amber`, Working `--prism-brand`, Done `--prism-emerald`
(Failed rose, Cancelled ink-muted). The bar uses those stops, with a short
outcome cap on settled jobs. Running jobs tick live occupancy + billed in/out
from the sidecar; settled jobs keep the final totals. Actions live in a
right-aligned icon-only `FocusJobBar`; hover names the action.

Related jobs (parent + nested children) sit above the meta. Clicking a related
row opens that job's Focus.

Focus is how Pulse / Board / List drill in. Closing it returns to the
current rendering with the same filter and range.

The old full-page accordion is deleted from Dashboard. It is not a fourth
view.

---

## 8. Compose — start a job (the missing verb)

Trinity: Create Agent wizard. We are not creating agents. We are creating a
job.

**New job** opens a 420px right drawer (same inspector column, mutually
exclusive with Focus).

```
New job
Repo          [ prism            ▾ ]
Title         [                    ]
Playbook      [ Blank brief      ▾ ]   ← plugin-pack skills + Blank
              From a finding: [ repo ▾ ] [ finding ▾ ]  (pair; no range/filter)
Placement     (•) checkout  ( ) worktree
Backend       follow Dispatch settings   (collapsed)
────────────────────────────────────
What should the teammate do?
[ PRD / brief, 8 rows                      ]
                              [ Queue job ]
```

- Defaults: current repo filter, or the only registered repo; placement
  `checkout` (ADR-0045); playbook `Blank brief`.
- Submit → `POST /api/jobs` → same `runtime.ts` path as MCP `start_job`,
  including the 500ms budget and the gate sequence. The drawer closes on the
  queued snapshot. A dirty tree becomes a visible `needs_confirm` on Attention
  and on Pulse — never a blocking modal.
- `job.source` = `console`.

---

## 9. Attention — Trinity's Operations → Needs Response

One column, max-width 720px (reading width is correct here).

```
Attention
3 need you

┌ needs_confirm ─────────────────────────────────────────────┐
│ ship-gate-smoke · prism                                    │
│ This checkout already has uncommitted changes. Start       │
│ anyway?                                                    │
│ dirty paths  8 shown · 209 more                            │
│                     [ Start anyway ]  [ Cancel ]  [ Delete ]│
└────────────────────────────────────────────────────────────┘
┌ waiting_on_you ────────────────────────────────────────────┐
│ review-findings · website                                  │
│ The teammate asked a question. Open Focus to answer.       │
│                                              [ Open job ]  │
└────────────────────────────────────────────────────────────┘
```

Empty: `Nothing is waiting on you.` — not a illustration, not a CTA to invent
work.

This milestone still uses the two existing confirm kinds. Typed arbitrary
worker questions (Trinity's operator queue) stay out of scope; the *surface*
is built so a third kind can land without a new page.

Finished-and-unreviewed jobs do **not** appear here. They stay on Dashboard
with the existing amber “to review” count.

---

## 10. First-run

Replace “No jobs yet — ask Prism to change something”.

When the hub has **zero registered repos** or the only repo has **zero jobs
and Iris has never loaded**:

```
Prism Dispatch
Point this Console at a repository, then start a job or let Iris look first.

[ Add repository ]     [ Load Iris ]
```

- **Add repository** → existing `POST /api/workspaces` plus a folder-path
  field (paste, not a native file picker — the daemon cannot open one).
- **Remove repository** → `POST /api/workspaces/remove`. Drops the checkout
  from the hub registry only. Board tile ⋮, List ⋮, and Settings.
  The tree and its jobs stay on disk. First-run returns if none remain.
- **Load Iris** → existing `POST /api/host` `{ method: "dashboard" }`, then
  route to `#/iris`.

When repos exist but there are no jobs: Dashboard still draws Pulse (lede +
idle strip) and the toolbar. Do not cover the fleet with a hero card once a
repo is registered.

---

## 11. Findings and Iris

### Findings

Keep the markdown reader. The index has the same **search / repo / time
range** filters as Dashboard. Add one primary button on a finding:
**Hand to a teammate** — opens compose with title + PRD pre-filled from the
finding (paths, blast, tests when present). That is the join.

### Iris (`#/iris`)

Replaces today's Intelligence tab.

```
Iris
Last refreshed  4m ago · 14,204 symbols · 1 workspace

[ Load analysis ]

Health  72 (B)     Testing  64     Security  80
Landmarks  18      Clusters  6     Domain  frontend

[ Open Spectrum ]
```

Numbers only after a successful host read. Button label stays **Load
analysis** until then — do not show `0` as a score (M-056).

**Spectrum** is `RepositoryMapView` in a full-bleed pane under the numbers, or
behind **Open Spectrum** if the map payload is large enough that mounting it
on first paint janks. Same component as the website hero. No 3D orb. No
avatar. Copy talks about Iris the way ADR-0052 requires: “Iris has indexed…”,
never “I found…”.

---

## 12. Settings

Keep the existing form. Move it to the rail. Progressive disclosure:

1. **How jobs run** — mode, placement, backend, max jobs, verify — open.
2. **Standup** — collapsed.
3. **Mentions** — collapsed, hidden entirely if Slack is not among host
   connectors.

Max-width 720px remains. This page is a form, not a fleet.

---

## 13. Visual system (Prism tokens, Trinity density)

| Role | Token / value |
|---|---|
| Canvas | `--prism-canvas` `#0a0e1a` |
| Panel / tile | `--prism-panel` `#131926` |
| Tile alt (info) | `--prism-canvas-alt` `#0f1420` |
| Line | `--prism-line` `#2a334a` |
| Ink | `--prism-ink` / new `ink-1..4` from P-C1 |
| Brand | `--prism-brand` `#00c2c2` |
| Accent (live cap, current rail) | **define** `--prism-accent` (sky). Delete `#38bdf8` fallbacks |
| Waited segment | muted ink @ 22% |
| Worked segment | brand @ 70% |
| Risk / fail | `--prism-rose` |
| Verify pass | `--prism-emerald` |
| Attention | `--prism-amber` |
| Type | Inter + JetBrains Mono. Dispatch wordmark stays serif italic |
| Radius | tile 12, chip pill, bar 4, mark 8 |
| Shadow | none on tiles (hairline only). Inspector may use `--prism-shadow-inspector` |

Trinity's “dark ink-ladder” is the P-C1 token repair. Until those rungs exist,
do not add more raw hex.

### Motion

| Motion | Where | Engine |
|---|---|---|
| Scanline | First snapshot of Pulse / Board / List / Iris | CSS, `--prism-dur-4`, off under reduced motion |
| Live pulse | State dot, running bar cap, Attention badge when blocking | Existing `job-pulse` |
| Rail fill | Focus lifecycle rail | Existing GSAP hook, Console only (ADR-0051) |
| View switch | Crossfade 200ms on the canvas only, not the shell | CSS |

No custom cursor on the Console (ADR-0051 §4 — chrome is website-only).
No particle fields. No magnetic buttons.

---

## 14. Breakpoints

| Width | Behaviour |
|---|---|
| ≥ 1100 | Spec as drawn |
| 720–1099 | Rail collapses to `variant="rail"` (icons). Inspector becomes a 100% overlay. |
| < 720 | Pulse cards stack. Board becomes one column. Compose / Focus are full-screen sheets. Host strip hides; it is in Settings instead. |

We are not shipping a mobile PWA. These breakpoints keep a laptop and a
half-width IDE webview usable.

---

## 15. Explicit non-goals (look like Trinity, do not become Trinity)

- Agent avatars, org zones, reporting arrows, drag-to-arrange, Tidy/Reset
- Cost / token figures (no persisted metric yet — do not estimate)
- Success-rate percentages (completion ≠ quality; we show verify pass/fail)
- Slack / Telegram / WhatsApp / voice / public links / x402
- A 3D Brain Orb
- A second Operations app with five tabs
- Refresh button

---

## 16. Implementer checklist

- [x] Shell matches §3 (rail + full-bleed + host strip with New job / Search)
- [x] Toolbar matches §3 (view switch, Grafana range, repo filter)
- [x] Pulse matches §4 (Live / Needs you / Settled, wait/work meters on every card, Focus on click)
- [x] Board and List honour the selected range
- [x] Focus is 75vw, no inner accordion, child lineage, design-system action row
- [x] Board matches §5 (repo tiles + two honest info tiles + Tiles menu)
- [x] List matches §6
- [x] Focus is the existing job panel, not a rewrite
- [x] Compose + `POST /api/jobs` match §8
- [x] Attention matches §9
- [x] First-run matches §10
- [x] Findings have **Hand to a teammate**
- [x] `#/iris` matches §11 and ADR-0052 voice
- [x] Tokens: no new raw hex; `--prism-accent` defined
- [x] Reduced motion: scanline and pulses off
- [x] Hands-on: opened the Console, switched Pulse / Board / List, opened
      Attention, Iris, compose (Esc closes). Did **not** start a job or trip a
      dirty-tree gate (dirty tree; would spawn a worker).
- [x] §2a craft bar: screenshots on Dashboard / Attention / Iris / compose;
      `/` + Esc; 1280 and ~900px. Remaining prototype leftover: footer density.
- [x] Homepage screenshots attached to the P-C9 report. Owner still answers
      whether Pulse and Board go on `prismhq.in`.
