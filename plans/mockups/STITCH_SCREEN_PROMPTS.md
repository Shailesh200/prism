# Google Stitch — Per-Screen Prompts (M-043 wave)

Prompts for generating Prism screens with **[Google Stitch](https://stitch.withgoogle.com)**.
One screen per prompt. When Stitch is happy, export the screen (Figma or code),
save the HTML under `plans/mockups/screens/html/` with the noted filename, and
hand it back — we build the React screen against `@repo-prism/core`.

## How to use with Stitch

1. Open Stitch → new project. For dense screens, use **Experimental mode**
   (Gemini 2.5 Pro) for better layout fidelity.
2. **Paste the "Stitch design brief"** from [`DESIGN.md`](./DESIGN.md) first — this
   pins the dark tokens, fonts, and app shell so they don't drift between screens.
3. Then paste **one screen prompt** from below. Generate.
4. Iterate with short follow-ups ("make the sidebar match the brief", "use mono
   for file paths", "tighten spacing"). Stitch is stateless-ish — re-pin the
   brief if tokens drift.
5. Export → save HTML as the filename in the table → tell me.

> Keep each generation to **one screen**. Long multi-screen prompts are the main
> cause of Stitch errors/timeouts.

## Related docs

- [`DESIGN.md`](./DESIGN.md) — dark design system + the **Stitch design brief** block
- [`LOCKED.md`](./LOCKED.md) — what's frozen (brand + ADR-0014)
- [`screens/SPECS.md`](./screens/SPECS.md) — implementation source-of-truth
- Existing exported HTML: `screens/html/01-repository-map.html`, `02-dashboard.html`, `03-landing.html`

## Save-as filenames (new screens)

| Screen | Save exported HTML as |
|---|---|
| Codebase DNA | `screens/html/04-codebase-dna.html` |
| Blast Radius / Change Impact | `screens/html/05-blast-radius.html` |
| Trends (historical health) | `screens/html/06-trends.html` |
| Integrations | `screens/html/07-integrations.html` |
| Settings (General) | `screens/html/08-settings.html` |
| Audit Logs | `screens/html/09-audit-logs.html` |
| Domain · Web (Lighthouse/CWV) | `screens/html/10-domain-web.html` |
| Domain · Backend (API surface) | `screens/html/11-domain-backend.html` |
| Domain · DevOps / Platform (IaC) | `screens/html/12-domain-devops.html` |
| Domain · Mobile (navigation) | `screens/html/13-domain-mobile.html` |
| Domain · Desktop (boundaries) | `screens/html/14-domain-desktop.html` |

---

## 1. Codebase DNA — `04-codebase-dna.html`

```
Using the Prism dark design brief and app shell, design ONE screen: "Codebase DNA".
Active left-nav item = Codebase DNA. Top-bar title "Codebase DNA", subtitle
"acme-web · main · Last sync 4m ago".

Content (scrollable):
1) Hero row of 4 stat tiles: Primary Language, Primary Stack Domain, Frameworks
   count, Test Runner (label + big value, mono where numeric, tiny sub-note).
2) Language composition: a horizontal stacked bar of per-language % share, with a
   legend list below (language, %, file count) in mono; teal/violet/amber segments.
3) Stack domains: a row of chips — Frontend, Backend, DevOps/Platform, Mobile,
   Desktop, Data/ML. Detected chips are teal with a confidence dot and a
   "View domain →" link + one-line evidence; undetected are faded. The link opens
   a dedicated, opt-in domain screen (nothing runs until the user clicks there).
4) Frameworks & libraries: a grid of small cards (name, category badge, version,
   "evidence: package.json / imports").
5) Personas: 2–3 cards describing likely contributor personas with the signals.
6) Architecture hints: chips (monorepo, layered, feature-sliced) with evidence.

Realistic placeholder data. Desktop 1440px, AA contrast, teal focus rings.
```

> **Built note:** this screen is now split in-app into **Codebase Profile** (the
> stack content above: hero tiles, language composition, stack domains, frameworks,
> packages, detection signals, personas) and **DNA Analysis** (the health-factor
> deep-dive: Parse Health, Coupling, Test Presence, Modularity, Diagnostics with
> meaning, formula, weight and how-to-improve). Both are reachable from their own
> Overview cards and sidebar items.
>
> **Deferred (blocked on Audit Logs):** each DNA Analysis factor card must show the
> **exact errors and suggested fixes** found while computing its number and
> deep-link to the matching **Audit Logs** entry (segregated by category —
> Analysis/Index/Git/…). e.g. Parse Health → list of files that failed to parse +
> reason; Coupling → unresolved imports / cycle members; Test Presence → source
> files missing a test. See the Audit Logs prompt (§6).

---

## 2. Blast Radius / Change Impact — `05-blast-radius.html`

```
Using the Prism dark design brief and app shell, design ONE screen: "Blast Radius".
Active left-nav = Blast Radius. Title "Blast Radius", subtitle "acme-web · main".

- Target bar at top: a "Change target" search/select with a file/symbol toggle,
  showing the resolved target as a chip (icon + mono path/symbol).
- Left column (~2/3):
  * Risk gauge card: a large 0–100 radial gauge (emerald→amber→rose ramp) with the
    score, a one-line rationale, and 3 mini-stats: Affected files, Direct
    dependents, Tests affected. Show a small "truncated" pill when partial.
  * Affected files list grouped by depth (Depth 1, Depth 2 …): each row = file icon
    + mono path + a reason chip ("imports X" / "references Y") + depth badge.
- Right column (~1/3), stacked cards:
  * Tests likely affected: list of mono test paths + a ghost "Run these" (disabled).
  * Change safety, tabs [Safe Delete | Rename Impact]:
      Safe Delete → verdict banner (safe/unsafe) + Blockers list + Orphans list.
      Rename Impact → a "new name" input + Edit sites list (file + ref count) +
      Breaking-change hints as severity chips (info/warning/danger).
- Empty state when no target: illustration + "Select a file or symbol to compute
  its blast radius."

Realistic placeholder data. Desktop 1440px, AA contrast, teal focus rings.
```

> **Built note (`05-blast-radius.html`):** playground screen wired to Core M-020 /
> M-021 contracts via `/api/impact` (parallel `blastRadius` + `safeDelete` +
> `renameImpact` + `testImpact`) and `/api/symbols` (`findSymbol`). **Target
> bar:** File / Symbol mode, file picker from dep graph, symbol search from KG.
> **Risk gauge** uses real `risk` 0–100 + derived rationale (affected / direct /
> tests / truncated); formula explained in tooltip. **Downstream Impact** groups
> `affectedFiles` by `depth` with `reason` chips + paginated load-more.
> **Change safety tabs:** Safe Delete (`safe` / `blockers` / `orphans`) and
> Rename Impact (`newName` simulate, `editSites`, `breakingChanges` severity).
> **Tests Affected** from `testImpact.tests` (path + reason + depth); Run
> disabled. No fabricated scores — empty until a target is selected.

---

## 3. Trends (historical health) — `06-trends.html`

> **Built** in playground (`TrendsScreen`): live KPIs (health / coupling / test
> presence / commits-in-window), real commit area + volume charts and churn
> hotspots from `getGitActivity`, author sample bars. Health-over-time series,
> KPI deltas, and region movers stay honest empty states until Core persists
> historical snapshots. Stitch HTML archived at `screens/html/06-trends.html`.

```
Using the Prism dark design brief and app shell, design ONE screen: "Trends".
Active left-nav = Trends. Title "Trends", subtitle "acme-web · main". Put a range
segmented control (1W / 1M / 3M / 6M / 1Y / Custom) in the top bar.

1) KPI delta row: 4 tiles (Health Score, Coupling Density, Test Presence, Commits)
   each with current value + delta vs range start (green up / red down arrow).
2) Health over time: a large area/multi-line time series (Health + factor lines,
   toggleable via legend chips); teal primary line, subtle gradient fill, hover
   tooltip with date + values.
3) Commit activity: an area chart of commits per day/week.
4) Churn hotspots: a table (file path mono, commits, +adds/−dels, last-author avatar).
5) Movers: two small lists — "Improving regions" and "Regressing regions" with deltas.

Add a note "Historical metrics are computed from local git history."
Realistic placeholder data. Desktop 1440px, AA contrast.
```

---

## 4. Integrations — `07-integrations.html`

> **Built** in playground (`IntegrationsScreen`): local-first banner + card grid.
> Honest statuses — MCP / CLI / Lighthouse·CWV **Available** (Details expanders,
> no fake Connected/port); VS Code, Cursor, GitHub/GitLab **Coming soon** (GitHub
> card keeps “opt-in, never automatic”). Stitch HTML at
> `screens/html/07-integrations.html`.

```
Using the Prism dark design brief and app shell, design ONE screen: "Integrations".
Active left-nav = Integrations. Title "Integrations", subtitle "Connect Prism to
your tools".

Top banner: "Local-first — Prism never sends code or data over the network unless
you explicitly enable an integration."
Then a grid of integration cards. Each: glyph/logo, name, one-line description, a
status pill (Connected / Available / Coming soon), and an action (Connect /
Configure / disabled "Soon"). Cards: MCP Server (Available), CLI (Available),
VS Code Extension (Coming soon), Cursor Extension (Coming soon), Lighthouse/CWV
ingest (Available), GitHub/GitLab read-only metadata (Coming soon, "opt-in, never
automatic").

Desktop 1440px, AA contrast, teal focus rings.
```

---

## 5. Settings (General) — `08-settings.html`

> **Built** in playground (`SettingsScreen`) from this prompt (no Stitch HTML yet).
> Live: workspace path + Change, Re-index now, map zoom/layers, density preference,
> locked privacy toggles, Integrations deep-link. Honest stubs: include/exclude
> chips, re-index-on-change, System theme, Audit Logs empty until Core audit
> trail exists. Save Stitch export later as `screens/html/08-settings.html`.

```
Using the Prism dark design brief and app shell, design ONE screen: "Settings".
Active left-nav = Settings. Two-column settings layout: a left in-page section nav
(General, Indexing, Appearance, Privacy, Audit Logs) and a right panel.

General panel (cards with labeled rows + controls, hairline dividers):
- Workspace: current repo path (mono, read-only) + "Change workspace" button +
  an "auto-detected" badge.
- Indexing: include/exclude globs (chips), "Re-index on change" toggle, max file
  size, "Re-index now" + last-indexed timestamp.
- Appearance: theme (Dark selected / System), density (Comfortable/Compact),
  monospace font.
- Privacy: "Local-only analysis" (on, locked), "Allow network integrations" (off),
  telemetry (off).
Each row: label + helper text left, control right.

Desktop 1440px, AA contrast.
```

---

## 6. Audit Logs — `09-audit-logs.html`

> **Built** in playground (`AuditLogsPanel` under Settings → Audit Logs).
> Session-local trail records real playground Core API calls (index/map, health,
> DNA, git, overlays, impact). Filters, expandable command/output/diagnostics,
> Export JSON, Clear. Not a Core-persisted store yet — footer states that.
> Stitch HTML archived at `screens/html/09-audit-logs.html`.

```
Using the Prism dark design brief and app shell, design ONE screen: "Audit Logs".
Active left-nav = Settings with the in-page section "Audit Logs" selected. Title
"Audit Logs", subtitle "Everything Prism did on this workspace — local, transparent".

- Filter bar: search; category chips (Index, Analysis, Git, Cache, Impact,
  Integration); status filter (Success/Warning/Error); time range; an "Export log"
  ghost button (JSON) on the right.
- Dense, mono-friendly log table, columns: Time (relative, exact on hover),
  Category badge, Operation, Target (repo/file, mono), Duration (ms, mono),
  Status pill. Rows expand to a detail panel showing the exact command or API call
  (e.g. `git log --numstat --no-merges`), parameters, and a scrollable OUTPUT
  block (mono) with a Copy button.
- Example rows: "Indexed repository" (Index, 1.2s, 4,318 files), "Computed health
  score" (Analysis, 84ms, score 82), "Computed coupling density" (Analysis),
  "git rev-parse --abbrev-ref HEAD" (Git), "Cache hit: index snapshot" (Cache),
  "Blast radius: src/app.ts" (Impact).
- Analysis rows for DNA/health factors expand to show the **exact errors found and
  suggested fixes** gathered while computing that number — e.g. parse failures
  behind Parse Health (file + reason), unresolved imports / import cycles behind
  Coupling, files missing tests behind Test Presence, diagnostics behind
  Diagnostics. Each errored target lists the offending path (mono) and a one-line
  remediation. These entries are the deep-link target from the DNA Analysis factor
  cards ("View in Audit Log").
- Footer note "Logs are stored locally and never uploaded."

Desktop 1440px, AA contrast.
```

---

## Domain screens — shared rules (screens 7–11)

Domain screens are **dedicated**, opened from a **"View domain →"** link on a
detected chip in Codebase DNA (one screen per domain). They are **all opt-in**:
nothing analyses automatically. Every domain screen must design **two states**:

1. **Idle (default):** a centered opt-in card — domain glyph, one-line description
   of what the analysis inspects, a note "Runs locally on demand — no network,
   no code leaves your machine", and a primary **"Run analysis"** button. Below it,
   a faint "What this reads" line naming the local sources (e.g. `package.json`,
   CI config, route files).
2. **Results:** the domain content below, plus a header control showing **"Last run
   <relative time>"** and a **"Re-run"** ghost button. Include a small source/evidence
   note ("computed from local files: …").

Keep both states in the same export (show results with a subtle "sample run" tag so
we can see the populated layout). Desktop 1440px, AA contrast, teal focus rings.

---

## 7. Domain · Web (Lighthouse / CWV) — `10-domain-web.html`

```
Using the Prism dark design brief and app shell, design ONE screen: "Web · Frontend"
(opened from a Codebase DNA "Frontend" chip). Title "Web · Frontend", subtitle
"acme-web · main".

1) CWV scorecard: 5 metric tiles — LCP, INP, CLS, FCP, TTFB — each with value
   (mono), a Good/Needs-Improvement/Poor pill (emerald/amber/rose), a small
   distribution bar, and a "Source: local lab fixture / ingest" tag.
2) Opportunities / diagnostics: a ranked Lighthouse-style list with estimated
   savings and affected resource paths (mono).
3) Attributions: a table mapping metrics to attributed files/components (mono paths).
4) Frontend surface map: a small treemap/list of frontend regions with a perf heat
   overlay, linking to the Repository Map performance layer.
Follow the shared domain-screen idle/results rule above. Idle CTA label = "Run
local lab"; idle note lists sources "local Lighthouse run or imported CWV report".
```

> **Built note (`10-domain-web.html`):** shipped as a dedicated **Web · Frontend**
> screen. Because CWV are field/lab measurements (not static analysis), Prism does
> **not** fabricate numbers — the CWV scorecard (LCP/INP/CLS/FCP/TTFB) renders an
> honest **"No data"** state with Good/Poor thresholds, and the opt-in card offers
> disabled **"Run local lab"** + **"Import CWV report"** actions. Opportunities,
> Attributions and the perf treemap light up once the local Lighthouse lab
> pipeline / CWV import lands (deferred — needs new Core capability, not faked).

---

## 8. Domain · Backend (API surface) — `11-domain-backend.html`

```
Using the Prism dark design brief and app shell, design ONE screen: "Backend ·
Services & APIs". Title "Backend · Services & APIs", subtitle "acme-web · main".

1) Summary tiles: Endpoints, Services/Modules, Public vs Internal, Untested endpoints.
2) API surface table: method badge (GET/POST/…), route (mono), handler file (mono),
   auth required?, "tests present" check, last changed. With a filter/search bar.
3) Service dependencies: a small node-link diagram (reuse map styling) of
   service/module edges.
4) Callouts: most-depended-on endpoints; endpoints with no tests.
Follow the shared domain-screen idle/results rule above; idle sources = "route/
controller files, framework manifests".
```

---

## 9. Domain · DevOps / Platform (IaC) — `12-domain-devops.html`

```
Using the Prism dark design brief and app shell, design ONE screen: "DevOps ·
Platform". Title "DevOps · Platform", subtitle "acme-web · main".

1) Tiles: IaC resources, CI/CD pipelines, Environments, Containers/Images.
2) IaC resources table: resource type (chip), name (mono), file (mono), provider,
   "referenced by" count.
3) Pipeline view: a horizontal stage diagram (build → test → deploy) parsed from CI
   config, each stage listing jobs; highlight long/failure-prone stages.
4) Dependency DAG: a small graph of resource dependencies (reuse map styling).
Follow the shared domain-screen idle/results rule above; idle sources = "IaC
manifests, CI/CD config, Dockerfiles".
```

> **Built note (`12-domain-devops.html`):** shipped over the `iac-resources`
> overlay. Tiles = IaC Resources / Pipelines / Containers / Kubernetes; an
> Infrastructure Surface table (IaC only), Composition, Findings, **Active
> Pipelines** (gated on Integrations · GitHub), and **CI/CD Pipelines** with a
> dispatcher-aware Trigger UI (`workflow_dispatch` inputs form /
> `repository_dispatch` type picker / “no manual dispatcher”). Core parses
> GitHub Actions locally (ADR-0016 Phase A). **Phase B:** live runs + enable
> Trigger via GitHub API. **Phase C (after Settings → Integrations):** Argo,
> Jenkins, other-repo CI, etc. — **cards appear only when that integration is
> connected** (no fabricated Argo/Jenkins data). Discoverability teaser lists
> planned connectors until Integrations ships. **Topology / Dependency DAG**
> deferred until Core emits real IaC edges (no UI over the placeholder edge).

---

## 10. Domain · Mobile (navigation) — `13-domain-mobile.html`

```
Using the Prism dark design brief and app shell, design ONE screen: "Mobile".
Title "Mobile", subtitle "acme-web · main".

1) Tiles: Screens, Navigators/Routes, Platform targets (iOS/Android), Deep links.
2) Navigation map: a tree/graph of screens and routes (reuse map styling): nodes =
   screens, edges = navigation transitions.
3) Screens table: screen/component name, file (mono), route, "has tests".
4) Callouts: unreachable screens, deepest navigation paths.
Follow the shared domain-screen idle/results rule above; idle sources = "navigation
config, screen/route components".
```

> **Built note (`13-domain-mobile.html`):** shipped over `mobile-nav`. Tiles =
> Screens / Navigators / Expo Router / Untested. **Screen Manifest** (path
> heuristics + optional `router: expo` + test filename heuristic via
> qa-test-gaps). **Navigators** list. **Wave 1:** Mobile Stack (DNA), Screen
> Churn Hotspots (git), Most Depended-on Screens (dep graph). **Deferred:**
> Navigation Topology / depth / unreachable screens (overlay edges are
> discovery-order stubs only), Platforms (iOS/Android), Deep Links — need richer
> Core scanners (backlog MO-*).

---

## 11. Domain · Desktop (boundaries) — `14-domain-desktop.html`

```
Using the Prism dark design brief and app shell, design ONE screen: "Desktop".
Title "Desktop", subtitle "acme-web · main".

1) Tiles: Processes (main/renderer), IPC channels, Windows, Native modules.
2) Boundary diagram: a two-lane diagram (Main ↔ Renderer) with IPC channels drawn
   as edges; highlight chatty/risky channels.
3) IPC table: channel name (mono), direction, sender file, receiver file,
   "has validation".
4) Callouts: unvalidated IPC, cross-boundary leaks.
Follow the shared domain-screen idle/results rule above; idle sources = "main/
renderer entry files, IPC channel definitions".
```

> **Built note (`14-domain-desktop.html`):** shipped over `desktop-boundary`.
> Tiles = Main / Renderer / IPC Files / Preload (or Tauri). **Process Surface**
> (kind · name · file). **Boundary Links** from real overlay edges (`ipc` /
> `exposes` / `loads` between main/preload/renderer). **Wave 1:** Desktop Stack
> (DNA Electron/Tauri), Process Churn Hotspots (git), Most Depended-on Process
> Files (dep graph). **Deferred:** per-channel IPC table (name/direction/
> validation), Windows, native modules, unvalidated IPC & payload-leak callouts
> — Core today only tags IPC-*touching* files, not channel inventory (backlog
> DT-*).

---

## Appendix — KPI "explain" copy (for card tooltips & the DNA screen)

Exact calculation explanations surfaced as card tooltips; mirror them wherever a
design shows a "how is this computed" affordance.

- **Health Score** — Weighted 0–100 composite of health factors (parse health,
  test presence, coupling, modularity, diagnostics) per ADR-0012. Grade is a band
  over the score.
- **Coupling Density** — `edges ÷ nodes` of the dependency graph (avg dependencies
  per module). Lower is looser; target < 0.50.
- **Test Presence** — ratio of files with test markers to source files, scaled 0–100.
- **Graph Size** — node & edge counts of the dependency graph, plus derived regions.
- **Codebase DNA** — the per-factor health bars (same factors as Health Score); the
  full DNA screen adds languages, frameworks, stack domains & personas.
- **Region Health** — per region: file count and a heuristic score
  `100 − (degree ÷ maxDegree) × 55` (more edges ⇒ lower score).
- **Most Connected** — regions ranked by total dependency degree (in+out edges); a
  proxy for blast-radius surface.
```
