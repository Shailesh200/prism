# M-043 — UI Fine-Tuning & Screen Prompts

| Field | Value |
|---|---|
| Branch | `milestone/M-043-ui-finetune` |
| Status | In Progress |
| Depends on | M-042, M-020, M-021 |
| Unlocks | Domain UI, DNA screen, Impact/Insights UI |
| Packages | `apps/playground`, `@prism/ui`, `@prism/core` (git signals) |

## Goal

Polish the shipped playground UI and prepare the next wave of screens. Split
into (a) changes we can build now against existing Core data, and (b)
design-gated screens for which we author UXPilot prompts and wait for HTML.

## In Scope — build now (no new design)

- **Explain tooltips** on every KPI/region card (Health Score, Coupling
  Density, Test Presence, Graph Size, Codebase DNA, Region Health, Most
  Connected) describing exactly how each number is derived.
- **Landing/repo input**: drop the "Demo fixture" preset, auto-detect the
  current workspace as the default root, keep the absolute-path input (with a
  helper label), rename **Go → Start Indexing**.
- **Codebase DNA card → affordance**: a `→` control that opens the DNA view
  (page itself is design-gated; ships as a "design in progress" placeholder for
  now).
- **Recent Activity enrichment** (git signals): local vs pushed commits,
  commit history, and a real **last-synced-at** (last fetch) timestamp.

## In Scope — author prompts, build after HTML arrives

Google Stitch prompts authored in `plans/mockups/STITCH_SCREEN_PROMPTS.md`
(one prompt per screen; shared dark brief in `plans/mockups/DESIGN.md`), designs
saved under `plans/mockups/screens/html/`:

- Codebase DNA screen — **built** (Stitch HTML `04-codebase-dna.html`; wired to
  Core `getDna()`: languages, frameworks, stack domains, personas, arch hints,
  per-package breakdown from `stack.packages`, and explainable detection signals
  from `stack.signals` with confidence + evidence)
- Domain screens are **dedicated + opt-in**: reached via a "View domain →" link
  on detected DNA chips; nothing analyses automatically. Prompts updated with a
  shared idle ("Run analysis") / results rule. Data sources: `getUtilityOverlay`
  (backend/devops/mobile/desktop/data) and `getCwvReport` + `startUtilityJob`
  (frontend Lighthouse/CWV).
- Backend domain screen — **built** (Stitch HTML `11-domain-backend.html`).
  Generic `DomainScreen` wired to Core `getUtilityOverlay` via a new opt-in
  `/api/overlay?kind=` endpoint + `fetchOverlay` client. Idle → Run analysis →
  results (hero tiles, detected-surface table with kind/name/file, composition
  bars, findings). Overlay-backed domains (backend/devops/mobile/desktop/data)
  share this shell; frontend shows a "Lighthouse lab coming soon" opt-in note
  (CWV job pipeline is separate). Real fields only — the mock's method/auth/test
  columns are omitted since Core does not emit them.
- Backend enrichment (**Wave 1**, reused Core signals only): the Backend run now
  fetches `api-surface` + `security-surface` + `qa-test-gaps` overlays and the
  dependency graph in parallel (new opt-in `/api/graph` → `getDependencyGraph` +
  `fetchDependencyGraph` client). Four extra cards: **Endpoint Test Coverage**
  (handler↔test filename heuristic), **Security Surface** (security-surface
  files/findings), **Churn Hotspots** (handlers × `getGitActivity` commit
  counts), **Most Depended-on** (handler in-degree from the dependency graph).
  Route-level `METHOD /path`, auth, data-layer, and env facets are **deferred to
  M-044** (ADR-0015) since they need new Core heuristics — not silently added
  here.
- Blast Radius / Change Impact screen (M-020/M-021 data) — **built**
- Trends (historical health) — **built** (`TrendsScreen`; real commit charts +
  churn from `getGitActivity`; health-over-time / KPI deltas / region movers
  show honest empty states until Core stores snapshots)
- Integrations — **built** (`IntegrationsScreen`; local-first banner; Available
  vs Coming soon cards with Details expanders — no fake Connected state)
- Settings — **built** (`SettingsScreen`; General / Indexing / Appearance /
  Privacy / Audit Logs sections; live workspace + re-index + map zoom/layers;
  locked privacy)
- Audit Logs — **built** (`AuditLogsPanel`; session-local trail of real
  playground Core API calls with filters / expand / export; durable Core audit
  + DNA deep-links still deferred — see note below)
- Domain screens: Web (Lighthouse/CWV), Backend (API surface), DevOps/Platform
  (IaC), Mobile (navigation), Desktop (boundaries)

## Deferred notes (for later milestones)

- **DNA Analysis ↔ Audit Logs cross-link** (blocked on Audit Logs tab): once the
  Audit Logs tab exists, each DNA Analysis health factor must surface the **exact
  errors and suggested fixes** captured while computing its number (e.g. parse
  failures behind Parse Health, unresolved imports/cycles behind Coupling,
  missing-test files behind Test Presence, diagnostics behind Diagnostics). The
  factor card should deep-link into the relevant Audit Logs entry filtered to that
  computation. Audit Logs will support **segregated categories** (Index, Analysis,
  Git, Cache, Impact, Integration …), so the deep-link targets the matching
  category/operation rather than the full log. Requires Core to persist per-factor
  evidence (errored targets + remediation) into the audit stream — no UI-only
  faking.
  - **Placeholder shipped:** each DNA Analysis metric card (five factors +
    Coupling Density) now renders a disabled **"Check logs" (Soon)** button; it
    will be enabled to deep-link into the matching Audit Logs entry once the tab
    exists.
- **DevOps · Active pipelines + Trigger** (blocked on Integrations · GitHub,
  ADR-0016 Phase B): list live/recent workflow runs; enable Trigger /
  Dispatch buttons. Local Phase A already parses `workflow_dispatch` inputs and
  `repository_dispatch` types and renders the matching (disabled) form.
- **DevOps · Later (ADR-0016 Phase C):** Argo, Jenkins, other-repo pipelines, and
  related DevOps cards — **only shown when the matching Integration is
  connected** (no card without connection; no fabricated data). Implement after
  **Settings → Integrations**. Until then DevOps shows a discoverability teaser
  listing planned connectors (Connect … Soon).
- **DevOps · Topology graph** (deferred): Stitch design’s Topology / resource
  DAG UI waits until Core emits **real IaC edges** (not the current single
  `related` placeholder). No UI-only fake graph.
- **Mobile · Topology / Platforms / Deep Links** (deferred): Navigation graph,
  depth, unreachable screens, iOS/Android, deep links wait for richer
  `mobile-nav` Core scanners (current edges are discovery-order stubs).

## Out of Scope

- Building the design-gated screens before their HTML is delivered
- Network calls in Core (git reads stay local — ahead/behind + FETCH_HEAD mtime)
- Wiring MCP/CLI surfaces (separate milestones)

## Definition of Done

- [x] Tooltips on all seven cards
- [x] Landing auto-detects workspace; "Start Indexing" button; helper label
- [x] DNA card `→` affordance + DNA view route
- [x] Recent Activity shows local/pushed + last-synced-at (git-signals extended + tested)
- [x] Backend Wave-1 cards (test coverage, security, churn, most depended-on) wired to reused Core signals
- [x] Wave-2 backend heuristics planned (M-044 + ADR-0015), not built here
- [x] DNA tab restructured into analytics: a **Health Factors** section explains
      each of the five DNA/Health factors (meaning, formula, ADR-0012 weight,
      current evidence, and concrete *how to improve* steps) with overall score +
      grade; stack profile grouped under a **Stack DNA** heading. Overview keeps
      the compact DNA summary card (now shows the grade). Clarified that the
      dashboard's **Coupling Density** (edges÷nodes fan-out) is distinct from the
      DNA **Coupling** factor (import-cycle penalty) to resolve the "40 vs 0.00"
      confusion.
- [x] DNA split into two focused views: **Codebase Profile** (stack — languages,
      domains, frameworks, packages, detection signals, personas) and **DNA
      Analysis** (health factors deep-dive). Overview gets a new **Codebase
      Profile** card (brief stack snapshot → profile view); the existing DNA card
      now opens **DNA Analysis**. Sidebar exposes both as separate nav items.
- [x] Web · Frontend domain screen built (Stitch HTML `10-domain-web.html`).
      Dedicated CWV layout (LCP/INP/CLS/FCP/TTFB scorecard + opt-in card). CWV are
      lab/field measurements, so the scorecard shows an honest **"No data"** state
      (thresholds only, no fabricated numbers); **Run local lab** + **Import CWV
      report** are disabled pending the local Lighthouse pipeline (deferred — new
      Core capability, not faked).
- [x] DevOps · Platform domain screen built (Stitch HTML `12-domain-devops.html`).
      Enriched view over `iac-resources`: infra tiles (IaC Resources, Pipelines,
      Containers, Kubernetes), Infrastructure Surface table (IaC only),
      Composition, Findings, **Active Pipelines** (Integrations gate), and
      **CI/CD Pipelines** with dispatcher-aware Trigger UI. Core detects GitHub
      Actions locally (events, jobs, `workflow_dispatch` inputs,
      `repository_dispatch` types). Live runs + Trigger execute deferred to
      Integrations; Argo/Jenkins/other repos = Phase C (ADR-0016).
- [x] Mobile domain screen built (Stitch HTML `13-domain-mobile.html`). Real
      `mobile-nav` data: Screens / Navigators / Expo Router / Untested tiles,
      Screen Manifest (+ test heuristic via qa-test-gaps), Navigators list.
      **Wave 1 cards:** Mobile Stack (DNA Expo/RN/Flutter), Screen Churn
      Hotspots (git), Most Depended-on Screens (dependency graph). Topology /
      Platforms / Deep Links / unreachable deferred until Core emits real nav
      edges & platform signals (no fake graph).
- [x] Desktop domain screen built (Stitch HTML `14-domain-desktop.html`). Real
      `desktop-boundary` data: Main / Renderer / IPC Files / Preload (or Tauri)
      tiles, Process Surface, Boundary Links (structural main↔preload↔renderer
      edges). **Wave 1 cards:** Desktop Stack (DNA Electron/Tauri), Process
      Churn Hotspots (git), Most Depended-on Process Files (dep graph).
      Per-channel IPC table, Windows, native modules, unvalidated IPC & leak
      callouts deferred until Core emits channel-level signals (no invented
      metrics).
- [x] Blast Radius / Change Impact screen built (Stitch HTML
      `05-blast-radius.html`). Wired to Core `blastRadius`, `safeDelete`,
      `renameImpact`, `testImpact` (+ `findSymbol` for symbol targets). Risk
      gauge, depth-grouped downstream list, Safe Delete / Rename tabs, and
      Tests Affected use real report fields only; Run-tests remains disabled.
- [x] Domain runs cached (memory + localStorage) so re-opening a domain restores
      the last run with its timestamp; skeleton shimmer while analyzing; commit
      activity defaults to 1W.
- [x] Dynamic card layout: card sections use a CSS multi-column **masonry**
      (`.card-masonry` / `.card-span-all`) so short/empty cards no longer leave
      vertical gaps — cards reflow by content height (Grafana-like, no drag).
      Applied to Overview (bottom row), DNA (detail grid) and Domain screens;
      wide tables (API Surface) span all columns.
- [x] `STITCH_SCREEN_PROMPTS.md` + dark `DESIGN.md` brief authored; mockups indexed
- [x] `bun run verify:milestone` green
- [x] Owner review + approval → commit on `milestone/M-043-ui-finetune`
- [ ] Owner approves merge → merge to main → PROGRESS Verified

## Verification

Typecheck · Lint · Unit · Build · Manual UI review on playground
