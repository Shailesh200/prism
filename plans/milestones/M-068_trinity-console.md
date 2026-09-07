# M-068 — Trinity-grade Console

| Field | Value |
|---|---|
| Status | **In Progress** |
| Branch | `milestone/M-068-trinity-console` (from latest `main`) |
| Depends on | M-067 (Shippable Product) |
| Unlocks | A Console that can start work and show a fleet; later loop / economics milestones |
| Packages | `@repo-prism/ui`, `@repo-prism/app-shell`, `@repo-prism/dispatch-hub`, `@repo-prism/dispatch`, `@repo-prism/mcp-server`, `apps/website`, `docs` |
| Adds | [ADR-0052](../adr/0052-product-identity-and-iris.md), [ADR-0053](../adr/0053-console-information-architecture.md) |
| Amends | [ADR-0014](../adr/0014-uxpilot-dark-product-ui.md), [ADR-0048](../adr/0048-prism-console-unification.md), [ADR-0051](../adr/0051-motion-system.md) |
| Design lock | [`mockups/CONSOLE_FLEET.md`](../mockups/CONSOLE_FLEET.md) — **implement against the frames** |
| Research | [`notes/COMPETITIVE_LANDSCAPE_2026-09.md`](../notes/COMPETITIVE_LANDSCAPE_2026-09.md) |
| Absorbs | The identity-only M-068 draft; conversation M-069–M-073 **UI** work. Planned **M-062** Console dead-ends (findings with no action, no create verb, table primitives) |

## 1. Goal

Ship a **production, sellable Console** — the surface a buyer opens after
the website and decides whether Prism is a product or a repo with a dark
theme.

That is the reason we studied Trinity and the rest of the market. Those
products win the first thirty seconds on craft: density, type, empty
states, a home that looks like money. Features we already have (honest
jobs, Iris, verification) do not sell themselves through a 1120px
accordion. **UI/UX is the milestone, not a wrap around the milestone.**

Concretely that means Trinity's control-plane architecture — one home,
three views, tiles you can read in two seconds, a timeline that shows
time, a list you can sort, a badge that only pulses when something is
blocked — **and** the verb theirs has and ours does not: start work.
It also means the craft bar in
[`CONSOLE_FLEET.md`](../mockups/CONSOLE_FLEET.md) §2a: screenshot-safe
chrome, one type system, four states on every control and every route,
keyboard, focus rings, homepage-worthy spacing. Views without that craft
are a side project, even if the tests are green.

M-067 shipped a honest job runner behind a reading column. That accordion
is a good inspector and a bad storefront. This milestone replaces the
storefront. Tokens stay Prism. Layout and density follow Trinity v0.9 as
locked. The last phase (P-C9) is a visual ship gate, same seriousness as
M-067 P-S7, judged with screenshots against `prismhq.in`.

One branch. Phases stay independently verifiable. A phase that adds a
view and leaves placeholder copy, unmatched spacing, or a blank empty
state is not closed.

## 2. Scope — eight phases

Run `bun run verify:milestone` at every phase boundary.

| ID | Ships | Trinity analogue |
|---|---|---|
| **P-C1** | Tokens + chart primitives + Iris copy rules | Ink ladder, sparklines, named cognitive core |
| **P-C2** | Shell: rail, full-bleed, host strip, toolbar, `/` filter, view switch | Dashboard chrome |
| **P-C3** | Pulse — Live / Needs you / Settled, wait/work meters, Focus inspector | Timeline (default), remapped |
| **P-C4** | Board — repo tiles, two honest info tiles, Tiles menu | Grid |
| **P-C5** | List — sortable job table | List |
| **P-C6** | `POST /api/jobs` + compose drawer + playbook picker | Create Agent, cut down to a job |
| **P-C7** | Attention inbox, findings handoff, first-run | Operations → Needs Response + empty states |
| **P-C8** | Iris route + Spectrum (`RepositoryMapView` in Console and website hero) | Brain tab / Orb, as a real map |
| **P-C9** | Production craft + visual ship gate | The difference between a demo and a product you can sell |

### P-C1 — Foundation

Without this, every later phase invents hex and a one-off SVG.

- Land ADR-0052 in `DESIGN_SYSTEM.md`: aperture framing, bounded definition,
  substitution test, no first person, no avatar. `docs:check` learns `Iris`
  and `Spectrum`.
- Define `--prism-accent`. Delete the `#38bdf8` fallbacks in `jobs-extra.css`.
  Add `ink-1..4` and `surface-1..4`. Move raw status hexes in Console
  `styles.css` and `jobs-extra.css` onto tokens. A test fails on a new raw hex
  in those two files.
- Extract `Sparkline`, `GanttRow`, `AreaChart`, `Gauge` into `@repo-prism/ui`
  from the SVG already working in `OverviewScreen` / `TrendsScreen`. Those
  two screens adopt the primitives. **No charting library.** Bundle delta
  stated.

### P-C2 — Shell

Build [`CONSOLE_FLEET.md`](../mockups/CONSOLE_FLEET.md) §3 and nothing else.

- Left rail from `AppSidebar` (`variant="full"`), Console items only:
  Dashboard, Attention, Findings, Iris, Settings.
- Main pane full-bleed. Retire `max-width: 1120px` on Dashboard / Attention /
  Iris.
- Top bar keeps the Dispatch wordmark; adds the host strip (CPU / mem / disk)
  with `—` on probe failure.
- Dashboard toolbar: **New job**, `/` filter, range, Pulse/Board/List
  switch. Persist the view. Delete **Refresh**.
- Hash redirects: `#/jobs` → Dashboard, `#/intelligence` → Iris,
  `#/workflows` → Attention.

The three renderings may still mount today's accordion behind the switch
until P-C3–C5 replace them, but the chrome must already be the new chrome.

### P-C3 — Pulse

Design lock §4. Default view.

- Live / Needs you / Settled sections plus an idle-repo strip. Range dropdown 30m / 1h / 6h / 12h / 24h / 7d / All.
- Live cards use dual wait/work meters from `queuedAt`/`startedAt`/`finishedAt` (ADR-0047 stamps). Running meters cap at `now`. Click a card → Focus.
- Actions sit in a top-right **⋯** menu (same as List). `running` gets **Add instruction** (compose-shaped drawer, `attach_context`). Every other status gets **Start New job from this finding** (compose, playbook finding, that job selected, title pre-filled). Finding playbook is repo + finding side by side.
- Click card → Focus inspector overlay (360px) with the **existing** job panel — review, `JobConsole`. Do not rewrite those.

### P-C4 — Board

Design lock §5.

- Repo tiles: mark, name, live/idle/blocked, counts, last job, sparkline, last verification (Success / Failure / NA). Click opens a job-list overlay. No overflow menu on the card.
- Info tiles on a **second collapsible row**: Dispatch summary + Recent failures (stacked chips, +N more). Click opens Live/blocked/waiting or failure lists in the overlay.
- `Tiles ▾` is a Popover (does not push the grid). No drag, no org overlay.

### P-C5 — List

Design lock §6. Sortable job table. Same Focus inspector. `/` filter
applies. Delete the Dashboard accordion list.

### P-C6 — Start work

Design lock §8. This is the largest product fix in the milestone.

- `POST /api/jobs` on the hub, token + origin allowlist unchanged, body
  forwarded to `createDispatchRuntime` / `start_job`. Same 500ms budget,
  same gates. Console origin stamps `job.source = "console"`.
- Compose drawer. Playbook picker reads the plugin pack skills (ADR-0050)
  plus Blank brief. Placement defaults to checkout.
- MCP `start_job` keeps working. The Console is another door, not a
  second runner.

### P-C7 — Attention, handoff, first-run

Design lock §9–§10 and Findings §11.

- `#/attention` lists `needs_confirm` and `waiting_on_you` only. Rail badge
  is that count; pulse only when the count is non-zero.
- Finding page: **Hand to a teammate** pre-fills compose (title, PRD, paths).
  Index filters: search, repository, time range.
- First-run when no repos: Add repository + Load Iris. Once a repo exists,
  empty Pulse idle strip, not a hero card.

Typed operator-queue questions beyond the two existing confirm kinds are
**not** in this phase. The page is shaped so a third kind can arrive later.

### P-C8 — Iris and Spectrum

Design lock §11. ADR-0052.

- Rename the Intelligence tab to Iris. Copy follows the substitution test.
- Successful `dashboard` RPC renders numbers; unsuccessful renders no `0`
  scores.
- Spectrum = `RepositoryMapView`. Mounted in the Console and as the
  website hero. The hero is truthful without JavaScript (ADR-0051 §5):
  heading and a still frame or structured fallback present in the HTML.
- No 3D orb. No Iris avatar. No first-person copy.

### P-C9 — Production craft (cannot skip, cannot “follow up”)

This phase exists so P-C2–C8 cannot close as “it works”. It is the
owner's main priority written as work.

Walk [`CONSOLE_FLEET.md`](../mockups/CONSOLE_FLEET.md) §2a and §16 as a
checklist, not a vibe:

- Unify type and spacing on every new route so Dashboard / Attention /
  Findings / Iris / Settings feel like one app, not five experiments.
- Four states on every new control and every new route. Fix any empty
  state that still reads like a developer message.
- Keyboard path (`/`, Esc, j/k, Enter, tab order) and `:focus-visible`.
- Toasts, live regions, hit targets, no prototype leftovers (Refresh,
  `job-<hex>` in chrome, WIP labels, dead footer links).
- Website and Console identity match (mark, teal, wordmark, Spectrum).
- Hand-verify 1280×800 and ~900px webview, plus the §14 stack.

Write a P-C9 report in the same shape as M-067 P-S7: verified by hand,
found-and-fixed, not-verified-and-why. Attach four screenshots
(Timeline, Board, Attention, Iris). The owner's question on that report
is: **would we put these on the website and sell this?** A “not yet”
fails the milestone. There is no “UI polish later” bucket after P-C9.

## 3. Out of scope

| Deferred | Why |
|---|---|
| Token / cost persistence and cost tiles | No metric on the job record yet; inventing $ figures fails M-056. Follow-up milestone. |
| Quality-vs-completion as a scored axis | We already show verify pass/fail. A second score needs a definition. |
| Generalized operator queue (arbitrary questions, expiry, options) | Surface ships in P-C7; the protocol does not. |
| Circuit breaker, retry, per-job timeout | Reliability, not the Trinity-UI brief. |
| Retention sweeps + blast-radius guard | Real problem; not a Console view. Follow-up. |
| findings → jobs → verify burndown loop | Needs P-C6 + P-C7 in production first. Follow-up. |
| Cron / scheduled edits | Read-only scheduled Iris refresh may be proposed later; unattended writes are rejected. |
| Org overlay, drag-to-arrange, avatars, autonomy toggles | Design lock §15. |
| Channels, voice, containers, SSO, mobile PWA, public links | ADR-0049 + loopback Console. |
| Renaming Prism, Dispatch, tools, or the worker | ADR-0052 §5 / §7. |
| M-062 DomainScreen split and IDE table work | Console dead-ends are absorbed here. The rest of M-062 stays planned. |

## 4. Definition of Done

- [x] Only one milestone `In Progress`
- [x] M-067 Verified and merged before this branch is cut
- [x] ADR-0052 and ADR-0053 moved from `Proposed` to `Accepted`
- [x] [`CONSOLE_FLEET.md`](../mockups/CONSOLE_FLEET.md) §16 implementation items ticked (hands-on + screenshots in §4a)
- [x] P-C1: accent + ink/surface ladders; hex test; four primitives; Iris rules in `DESIGN_SYSTEM.md`
- [x] P-C2: rail, full-bleed, host strip, toolbar; `#/jobs` still opens Dashboard
- [x] P-C3: Pulse is the default; wait/work meters; Focus on click
- [x] P-C4: Board tiles + two honest info tiles
- [x] P-C5: List table; accordion gone from Dashboard
- [x] P-C6: compose + `POST /api/jobs` + playbook `console` on the job record
- [x] P-C7: Attention badge honest; finding handoff; first-run copy replaced
- [x] P-C8: `#/iris` + Spectrum in Console and website hero; no first-person Iris
- [x] P-C9: craft + screenshots attached; owner visual yes 2026-09-07
- [x] `bun run verify:milestone` green
- [x] Hands-on gate written as a P-C9 report (below)
- [x] Owner approval → commit → merge → Verified → snippet shared

## 4a. P-C9 ship-gate report

Run 2026-09-05 on `milestone/M-068-trinity-console`. Automated claims were
read from the suite. The live Console pass is recorded separately so a green
test run cannot stand in for “would we sell this.”

### Verified in code / suite

| Claim | Evidence |
|---|---|
| Tokens, no raw hex | `--prism-accent`, ink/surface ladders in `tokens.css`. `hex-tokens.test.ts` fails on a new `#` outside `var(--token, #fallback)` in `styles.css` and `jobs-extra.css`. |
| Chart primitives | `Sparkline`, `AreaChart`, `Gauge`, `GanttRow` in `@repo-prism/ui`. Overview HealthRing and Trends area charts consume them. Domain `0–100` still mid-plots a flat 50 (`TrendsScreen.test.tsx`). |
| Hash IA | `#/jobs` → dashboard, `#/intelligence` → iris, `#/workflows` → attention (`console.test.ts`). |
| Timeline geometry | `ganttBarsForRepo` clips waited/worked to the range. Playbook notch is `console` / `finding` / `chat`. |
| Attention filter | `attentionJobs` keeps only `needs_confirm` and `waiting_on_you`. Rail badge renders only when that count is > 0. |
| `POST /api/jobs` | Hub test injects `startJob`, asserts title/prd/playbook/placement, 400 without a title, and `GET /api/telemetry/host` returns cpu/mem keys. |
| Host strip honesty | `readHostTelemetry` leaves fields `undefined` on probe failure. UI prints `—`, not `0`. |
| Iris / Spectrum named | `docs:check` requires **Iris** and **Spectrum** in `DESIGN_SYSTEM.md` and `docs/reference/glossary.md`. |
| No accordion on Dashboard | Dashboard mounts Pulse / Board / List only. Focus reuses `JobsScreen` `chrome="inspector"`. No Refresh button on the Dashboard toolbar (ADR-0053). |
| Website Spectrum | Hero figure is labelled Spectrum; figcaption + `<noscript>` stay in the HTML (ADR-0051). Accent on the site is `#38bdf8`, same as the product token. |

### Found by the gate, and fixed

1. **`#38bdf8` leftovers and status hexes** in `jobs-extra.css` / `styles.css` were still raw. Moved onto `--prism-amber` / `--prism-rose` / `--prism-emerald` / `--prism-violet` / `--prism-accent`.
2. **Trends H1 regression.** First primitive swap used `seriesGeometry` without a 0–100 domain, so a flat health 50 painted at the top. Domain + pad now pass through `AreaChart`.
3. **`console.test.ts` imported `console-app.tsx`.** Vitest loaded JSX without a React runtime (`React is not defined`). `repoLabel` moved to `fleet.ts`.
4. **Dashboard 1120px column** retired. Fleet CSS is full-bleed; rail + 360px Focus at 1280, icon-only rail at 960.
5. **`host-session` imported `@repo-prism/app-shell` from a devDependency.** Promoted to `dependencies` so the Console/host RPC package declares what it actually imports.
6. **Timeline stats clipped to `0 wai`.** Stats column was 140px. Now `minmax(9rem, auto)`.
7. **Host strip dropped units and DISK.** `fmtGb` now prints `G`; disk percent was clipping off the bar.
8. **Iris listed absolute paths.** Homepage screenshot test forbids them. Labels + job counts only.

### Verified in the live Console (1.1.17 on `:17330`)

Opened `prismhq.localhost:17330` against this checkout. Rail, host strip, toolbar, Timeline / Board / List, Attention empty state, Iris, and compose all rendered. Esc closed compose. At ~900px the rail collapsed to icons and “0 live · 0 wait” stayed unclipped. Host strip reads `CPU · MEM xG/yG · DISK n%` with `—` only when a probe fails.

Screenshots:

- Timeline — [`notes/m068-timeline.png`](../notes/m068-timeline.png)
- Board — [`notes/m068-board.png`](../notes/m068-board.png)
- Attention — [`notes/m068-attention.png`](../notes/m068-attention.png)
- Iris — [`notes/m068-iris.png`](../notes/m068-iris.png)
- Compose — [`notes/m068-compose.png`](../notes/m068-compose.png)
- ~900px Timeline — [`notes/m068-timeline-900.png`](../notes/m068-timeline-900.png)

### Not verified, and why

- **A Console-started job on the Timeline, a dirty-tree gate, and Load Iris → Spectrum.** The tree is dirty and starting a real teammate from here would spawn a worker. HTTP + unit paths are covered; the pixels of a live bar are not.
- **Windows.** No machine.

### Known rough edges

- Spectrum on the website is the existing package-graph schematic plus a truthful caption, not a live `RepositoryMapView` of this checkout. The live map mounts on `#/iris` after analysis. A static exported map JSON would be more honest later.
- Settings Standup / Mentions are collapsed `<details>`. Job-run knobs stay in the open fieldset.
- List `j`/`k`/`Enter` work only while List is mounted; they are not a Console-wide command palette.
- Compose playbooks are the plugin-pack skill ids plus Blank / From a finding. They are not discovered dynamically from disk yet.

### Owner question

Would we put Pulse and Board on `prismhq.in` and sell this? **Owner yes, 2026-09-07.** Remaining work is the 1.8.0 publish, not more Console features.

## 5. References

- [`mockups/CONSOLE_FLEET.md`](../mockups/CONSOLE_FLEET.md) — visual lock
- [ADR-0052](../adr/0052-product-identity-and-iris.md) — Iris / Spectrum
- [ADR-0053](../adr/0053-console-information-architecture.md) — repo is the unit; Console starts work
- [ADR-0047](../adr/0047-job-queue-and-latency-budget.md) — the stamps Pulse meters
- [ADR-0048](../adr/0048-prism-console-unification.md) — the daemon this restyles
- [ADR-0050](../adr/0050-prism-plugin-pack.md) — playbooks
- [ADR-0051](../adr/0051-motion-system.md) — scanline + no GSAP in the webview
- `plans/UX_SIMPLICITY.md` — one canvas, three actions
- `plans/DESIGN_SYSTEM.md` — cartographic, not chat
