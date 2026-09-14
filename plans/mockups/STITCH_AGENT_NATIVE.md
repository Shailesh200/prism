# Stitch — Agent-native Iris (15 × 3)

Google Stitch project: `projects/10137496421656524676`  
Design system: `assets/d245d959e20741b4b1a79458a19c19b6`  
Program: [`../milestones/PROGRAM_agent-native-iris.md`](../milestones/PROGRAM_agent-native-iris.md)

Open: [stitch.withgoogle.com](https://stitch.withgoogle.com) → project **Prism — agent-native Iris (15 features × 3)**.

## Rules

- Desktop 1440×900. Dark Prism tokens only. No chat, no avatars, no iris-eye, no glow.
- **Envelope** is the agentic-experience product (pipe, True Refs, Honest Edges, Context Pack, Reuse First). Stitch IDs 01–05 are capabilities of Envelope, not five SKUs.
- After each base screen, generate **3 layout variants** (inspector / workbench / instrument). Aspect: LAYOUT. Range: EXPLORE.
- Realistic paths from a fictional repo `acme/ledger` (not lorem).

## Screen index

| # | Feature | Cut | Shell | Save HTML as |
|---|---|---|---|---|
| 01 | Envelope (Iris rows) | 1 | Console Iris | `screens/html/an-01-mcp-session.html` |
| 02 | Reference precision | 1 | Iris | `screens/html/an-02-precision.html` |
| 03 | Edge provenance | 1 | Iris | `screens/html/an-03-provenance.html` |
| 04 | Context pack | 1 | Iris | `screens/html/an-04-context-pack.html` |
| 05 | Reuse-first | 1 | Iris | `screens/html/an-05-reuse.html` |
| 06 | Finding Loop | 1 | Findings + Pulse; Spectrum layer | `screens/html/an-06-health-loop.html` |
| 07 | Conventions | 1 | Iris | `screens/html/an-07-conventions.html` |
| 08 | Living AGENTS.md + drift (`~/.prism`) | 2 | Settings | `screens/html/an-08-agents-md.html` |
| 09 | Working-set restore | 2 | Console Focus | `screens/html/an-09-working-set.html` |
| 10 | Prism Guard | 1 | IDE webview | `screens/html/an-10-guard.html` |
| 11 | Over-engineering findings | 2 | Console Findings | `screens/html/an-11-bloat.html` |
| 12 | Fleet job cost | 2 | Pulse | `screens/html/an-12-cost.html` |
| 13 | Symbol memory | 3 | Iris inspector | `screens/html/an-13-symbol-memory.html` |
| 14 | ADR / WHY nodes | 3 | Iris | `screens/html/an-14-rationale.html` |
| 15 | Work order + hook | 3 | IDE + Console | `screens/html/an-15-work-order.html` |

IDs filled in after generation. `list_screens` currently only returns the DESIGN.md upload instance (`15956132351828531136`); bases below were returned by `generate_screen_from_text`. Layout variants: use Inspector / Workbench / Instrument via `generate_variants` (LAYOUT × 3) or dedicated screens — see table.

| # | Feature | Base screen id |
|---|---|---|
| 01 | Bounded MCP session | `639754403e9b454daf55d9e85bc6fdae` |
| 02 | Reference precision | `5ee0f91652104e6fbf403bb68cc54411` |
| 03 | Edge provenance | `7e7f1d088fe14095b373a97bfe0d9ba9` |
| 04 | Context pack | `7edc3e6851054c1c826e96d1f236ec79` |
| 05 | Reuse-first | `2ba4ad8a9b0d49959e842dcaaf3b7223` |
| 06 | Health → jobs loop | `58dde18fe5b041958a0ca397e3094897` |
| 07 | Conventions | `953c7d1407d04914857746332a1f0bf9` |
| 08 | Living AGENTS.md + drift | `1e87af2033b44eca83c90a9f0ea32084` |
| 09 | Working-set restore | `3545404452be45dd9786667dc58e92b7` |
| 10 | Prism Guard | `b72afd60530a4fcc8795ea043b5cf50b` |
| 11 | Over-engineering findings | `dc1af3a91fc94a0b8091e1f731c7953d` |
| 12 | Fleet job cost | `e76869b51ad14f528da78c19ed4ba3a8` |
| 13 | Symbol memory | `2695d2fffe674e7389b39bf430907249` |
| 14 | ADR / WHY nodes | `a86e368a5a8647fd8cb0e4544fd5d51a` |
| 15 | Work order + hook | `bb4a8483c11d4683b207cbc68c1354f2` |

## Envelope — Console Iris (shipping lock) — 2026-09-11

Owner lock: `#/iris` has **no map**. **Repos ▾** above Envelope (Dashboard control). **No REPO column.** Spec: [`CONSOLE_FLEET.md`](./CONSOLE_FLEET.md) §11. Pixel-perfect implementation: §2b there, and **Implementation bar** below.

| Layout | Screen id | Title | Role |
|---|---|---|---|
| **Iris (recommend ship)** | `6fc2ccb3f5984e6da89ca7e011eae746` | Envelope — Iris | Filter + facts + one-row pipe scoreboard + pack/reuse/refs/edges |
| Workbench | `90d2e9f15e3d4830afc6529bbb176e67` | Envelope — Iris Workbench | Filter + one dense ledger row (no REPO) |
| Instrument | `6e1f0972e44348eeaecea8805ed867d0` | Envelope — Iris Instrument | Filter + three grade meters + selected query |

Superseded same-title frames stay on the canvas (`61bb2491…`, `cf241273…`, `7f70af79…`, `0c2f9eb1…`, `15d66058…`, `df55a172…`, etc.).

Older Envelope JSON-session frames (Inspector `dc2d8b8b…` / Workbench `0ca4c2c9…` / Instrument `cd7cf8e7…`) remain a contract lock of the **pipe**, not the Iris tab.

## Implementation bar (approved screens)

When the owner marks a Stitch frame **approved**, that PNG is the visual source of truth. Coding (after the milestone is approved) is **pixel-perfect** against it:

- `tokens.css` only — Inter + JetBrains Mono, spacing 4/8/16/24/32, rail 224, top bar 48
- Hairline `#2A334A`. No glow, glass, avatars, chat, or invented chrome
- Do not add or omit columns, filters, or panels vs the approved frame
- Screenshot DoD: side-by-side at 1440 and 1280. Overflow and clipped labels are defects

This bar applies to **every** later approved screen, not only Envelope. Unapproved frames are exploration; do not implement them.

**Currently approved (pending owner confirm of this filter pass):** Envelope — Iris `6fc2ccb3…` (ship). Workbench / Instrument as listed above.

## Envelope (fresh, Graphify framing) — 2026-09-11

Brand-new Envelope set (do **not** overwrite the older 01 Bounded MCP session IDs). Same job: bounded MCP serving contract `{ items, totalCount, truncated, limit }`. Not a graph. Not Context Pack.

**Shipping UI** is Console `#/iris` — see table above.

| Layout | Screen id | Title |
|---|---|---|
| Inspector | `dc2d8b8bf8f34bf498887c1482204d3b` | Envelope — Inspector |
| Workbench | `0ca4c2c9fe0b4fd58db40e4dd7d2c4d4` | Envelope — Workbench |
| Instrument | `cd7cf8e728564ad7878d08a398ad68c5` | Envelope — Instrument |

Treat the **base** as Inspector (Spectrum/list + 288px inspector) unless a dedicated Inspector variant exists. `generate_variants` times out on the MCP client; remaining Workbench/Instrument screens are generated as named screens.

| # | Inspector | Workbench | Instrument |
|---|---|---|---|
| 01 | `7af6317b076341a7a52ad2ee56f0ef4f` | `0eefcc31f31d49c6a4ccc21b227994f3` | `b705af9df90146239ce4c56b51b26e2b` |
| 02 | base | `8f6307ca4f024880a85d145a3521e18e` | `bdf5fb371b8a417d9689c3390d8ce4fa` |
| 03 | base | `ce306e765bdb4e75a2cb64a74e49f4e7` | `3bd9836a4beb4945b2474958cfb241bf` |
| 04 | base | — (timed out) | `ac9504c27e57425bb849be60c1aab946` |
| 05–15 | base | — | — |

Workbench/Instrument generation for 04–15 was **stopped** (not in progress). Ask to resume if you want the rest.

Stitch `list_screens` only returns the DESIGN.md upload (`15956132351828531136`). Screens still exist by id; open the project in [Stitch](https://stitch.withgoogle.com) and look in the screen library, not only the canvas.

## Shared Console chrome (fleet screens)

224px left rail: Pulse (active), Board, List, Attention, Iris, Findings, Skills. Workspace chip `ledger · main`. Host strip CPU/mem. No user face — repo mark “L”. Top bar 48px. Teal primary, ghost secondary.

## Shared Iris chrome (Console `#/iris`)

Same rail with **Iris** active. **No Spectrum / `RepositoryMapView`.** Canvas
toolbar: **Repos ▾** (indexed workspaces, default current). Main: Repository
analysis (facts) plus Envelope scoreboard **for the filtered repo** — no REPO
column. Pack / reuse / refs / edges for that same repo. Graph screens
(precision, provenance, pack, rationale) use the playground / website / IDE
map, not this tab.
