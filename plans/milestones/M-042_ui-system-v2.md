# M-042 — UI System v2 (Signal Chart, premium)

| Field | Value |
|---|---|
| Branch | `milestone/M-042-ui-system-v2` |
| Status | In Progress |
| Depends on | M-018, M-019 |
| Unlocks | M-030/M-031 (IDE webview), M-038 (docs) |
| Packages | `@repo-prism/ui`, `apps/playground` (consume only) |

## Goal

Elevate the Repository Map to a world-class, instrument-grade "Signal Chart" experience without changing the locked brand (teal / faceted-P) or the light-first identity.

Delivered as review-gated slices. Each slice is implemented, shown to the owner, and iterated before the next.

## Scope expansion (2026-07-22, ADR-0013)

Owner-directed rethink after large-codebase testing. This milestone now also reworks the map model and adds real Git history (see [ADR-0013](../adr/0013-unified-map-and-git-signals.md)). It therefore crosses package boundaries beyond `@repo-prism/ui`:

- Unified semantic-zoom map: `repo -> package -> file -> symbol` as one continuous drill-down (click to descend, breadcrumb to ascend); the rail reflects position.
- Feature demoted from an altitude to a lens/overlay.
- Treemap-for-scale + cards-for-detail (reusing the Highcharts density view) so large repos stay readable; nodes carry `attrs.weight` + a drill-scope pointer.
- Local, no-network Git signals in Core (`git log --numstat`): per-file last commit, contributors, churn, recency; fails soft on non-git roots.
- Real `activity` (recency) and `ownership` (top author) layers; a GitLens-style inspector History panel.

Packages touched: `@repo-prism/shared` (git DTO types), `@repo-prism/core` (git reader IO), `@repo-prism/repository-map` (weight + git wiring, real layer signals), `@repo-prism/ui` + `apps/playground` (unified map, drill-down, lens, History).

## Scope expansion (2026-07-22, ADR-0014) — UXPilot dark relock

Owner chose **Option B**: rebuild the product UI to match the UXPilot mockups
([`plans/mockups/screens/html/`](../mockups/screens/html/)) pixel-close, as a
single deliverable. This relocks the product theme from light Signal Chart to
**dark** (see [ADR-0014](../adr/0014-uxpilot-dark-product-ui.md)):

- `packages/ui/src/tokens.css` rewritten to the dark palette (same `--prism-*`
  names) so the whole map/inspector/treemap reskins from one file.
- Map shell gains a **left KPI sidebar** (repo stats, feature regions, layers,
  recent) and keeps the **dependency edge graph**; **blast rings** show only on
  the selected node.
- Inspector rebuilt into UXPilot sections: identity, tags, metric bars, blast
  summary, dependencies (in/out), ownership, CTAs (Open · See impact · Bookmark).
- New **Overview** screen in the playground (derived locally from the map graph,
  no Plotly/network); nav toggles Map / Overview.
- Fonts: Inter + JetBrains Mono (self-hosted via `@fontsource`).

## Refinement (2026-07-22) — dashboard hub + git activity

Owner feedback after first dark pass:

- Removed the bottom `ZoomRail` (Repo/Package/File/Symbol) and the density
  view toggles (Treemap/Icicle) from the map — navigation is double-click to
  drill + breadcrumb to ascend; cards remain the only render.
- **Overview is now the default landing** and acts as a navigation hub: header
  with **"Last synced"** timestamp + Refresh, a row of nav tiles (Repository
  Map primary; Impact/Dependencies/Health as "coming soon"), KPI row, Codebase
  DNA, an SVG **Architecture** mini-graph preview, **Recent Activity** feed, and
  Blast Radius Risk + Region Health.
- New public Core API **`PrismWorkspace.getGitActivity()`** → `GitActivity`
  DTO (`@repo-prism/shared`): repo-wide `recentFiles`, `recentCommits`, and the git
  `summary`; `available:false` on non-git roots, no network. Surfaced by the
  playground dev server at **`GET /api/git`** and consumed by the dashboard and
  the map's left "Recent Changes" section.

## Refinement (2026-07-22) — dashboard to match mockup (`02-dashboard.html`)

Owner feedback: dashboard must match the mockup (left sidenav, richer cards,
git-user avatars); disable / "coming soon" anything not yet built (no dummy
data).

- **Overview rebuilt** to the mockup shell: **left sidenav** (logo, repo box,
  Workspace + Settings nav, git-user footer), top bar (title · branch · last
  sync + Sync/Share/Open Map), a **KPI row** (Health ring, Coupling density,
  Test presence, Graph size), **Codebase DNA** (Core `getHealth` factors),
  **Commit Activity** area chart (real git `weeks`), **Region Health**, **Most
  Connected** modules, and **Recent Activity** (git, with avatars).
- **Git-user avatars**: `Avatar` component renders a deterministic gradient +
  initials and overlays the author's **Gravatar** (from commit email) with a
  local fallback (`d=404` → onError). Requires the git reader to capture email.
- Git reader extended (still local, no network): author **email** (`%ae`),
  current **branch** (`rev-parse --abbrev-ref HEAD`), per-file **last-commit
  churn** (`lastAdditions`/`lastDeletions`), and a repo-wide weekly **`weeks`**
  aggregate. New DTO fields on `GitCommitRef.email`, `GitRepoSummary.branch`,
  `GitFileSignal.last*`, `GitRecentFile.additions/deletions`, `GitActivity.weeks`.
- New public Core surface **`getHealth`** exposed by the dev server at
  **`GET /api/health`** (score + grade + factors) — drives the health ring +
  DNA bars.
- **Shared app nav (`AppSidebar`)**: the dashboard's left nav is now a reusable
  component. On the **Overview** it renders full-width; on the **Repository Map**
  it renders as a collapsed ~56px icon **rail** that cascades open to 224px on
  hover/focus, overlaying the canvas (the map keeps its own left Repository/KPI
  sidebar underneath). Nav switches Overview ↔ Map; other items are "Soon".
- **Honesty / "coming soon" (no dummy data):** historical health trends,
  per-region score trends & week/month deltas, Pull Requests, Integrations,
  Settings, cloud Share, and true **Blast Radius** (Core `blastRadius()` is not
  implemented) are shown as disabled "Soon" states. The "Most Connected" card
  uses **real dependency degree** and is explicitly *not* labeled blast radius.
  Test **coverage %** is shown as the real "Test presence" factor, not a fake
  coverage number.
- **Polish (closeout):** pure UI logic was extracted to testable modules
  (`avatar-util.ts`, `overview-model.ts`, `md5.ts`) with unit tests (md5 RFC
  vectors, gravatar/initials/gradient, coupling/DNA/region + activity-chart
  geometry); `prefers-reduced-motion` is honored for the nav-rail expand and
  dashboard transitions; the Map breadcrumb shows the **real git branch**
  (wired from `getGitActivity().summary.branch`, falling back to the map's git
  summary); the redundant dev-strip Map/Overview toggle was removed (the nav
  rail owns view switching); and the dashboard shows a distinct **error** state
  ("couldn't reach local git") separate from loading / not-a-git-repo.
- **Commit Activity range filters:** Core `getGitActivity()` now returns a
  repo-wide **daily commit histogram** (`days: {date, commits}[]`, distinct
  commits/day across the full scanned window). The dashboard chart adds a
  segmented range control (**4W / 12W / 26W / 52W**) plus a **Custom date range**
  (From/To pickers). Windows ≤ 8 weeks render daily buckets; longer windows roll
  up weekly (legend + total update accordingly). Bucketing/preset math lives in
  `overview-model.ts` and is unit-tested.
- **Dense-level map layout:** the file-zoom card tree now wraps a level's
  children into a **near-square grid** (`childGridCols` ≈ ⌈√n⌉, capped at 6)
  instead of one runaway horizontal strip when a folder/package has many
  members. Measurement accounts for grid width *and* height so wrapped rows
  never overlap; a covering test asserts a dense 18-file level wraps into
  multiple rows with zero overlaps.

## Direction

- Match the UXPilot dark designs; keep the faceted-P brand mark.
- Dark-only now; tokens structured so a light theme is a later variable flip, not a rewrite.
- Use mature libraries liberally (do not hand-build what a library does better); style with our CSS tokens so the look stays bespoke.
- Take Material icons + Radix primitives; do NOT adopt full MUI/Tailwind component frameworks.

## Library stack

- `motion` — animation (rail indicator, entrances, edge draw-in, transitions).
- `@radix-ui/react-*` primitives — accessible tooltip/popover/toggle behavior, our styling.
- `lucide-react` — UI chrome + zoom-rail level icons.
- Material file-type icon set (`material-icon-theme` or fallback) — File/Symbol slices, replacing the hand-rolled SVG sprite.
- `cmdk` — command palette / search (later slice).

## Slices

1. **Zoom rail + Feature canvas** (this slice): altitude control (icons, animated indicator, keyboard, breadcrumb) + Feature overview redesign (cards, cluster islands, edges, atmosphere, motion). Also upgrades Repo + Package (shared overview renderer).
2. **File view**: card-tree + Highcharts treemap/icicle density; Material file-type icons.
3. **Symbol view**: symbol-scoped renderers + polish.
4. **Command palette** (⌘K) + global search, and remaining chrome (top bar, inspector) polish.

## In Scope (Slice 1)

- New `ZoomRail` altitude control shared by all zoom levels, with animated active indicator, keyboard shortcuts, and a clickable scope breadcrumb.
- Feature overview canvas redesign: `MapNode` region cards, cluster islands, curved weight-aware edges with draw-in + neighbor highlight, layered cartographic basemap (`MapAtmosphere`), staggered entrance + crossfade transitions.
- Restyle `MapControls` (zoom/fit) to match.
- Extend `tokens.css` with motion/easing, elevation, and refined map tokens (theme-ready).

## Out of Scope

- File/Symbol/density and command palette (later slices).
- Any change to `@repo-prism/core`, analysis, or map DTOs.
- Dark theme (planned, not built).
- Brand mark / logo changes (locked).

## Definition of Done (milestone)

- [x] All slices implemented and owner-reviewed.
- [x] `bun run verify:milestone` green.
- [x] Existing `@repo-prism/ui` tests pass; new UI has states covered (hover/focus/selected/reduced-motion).
- [x] Owner approval -> commit -> merge -> then next milestone from `main`.

> Closeout boxes ticked 2026-08-05 during M-051 Phase 4. Approved and merged
> 2026-07-22 (see `plans/PROGRESS.md`).

## Verification

`bun run verify:milestone` · Manual: `bun run playground` on fixture + this repo; per-slice visual review.

## Notes

- M-019 (Map Layers) is parked as `Deferred`; its uncommitted layer work (`MapLayersPanel`, layer signals) is carried into this branch and remains consumed by the map UI.
