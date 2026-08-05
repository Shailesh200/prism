# M-046 — Intelligence Accuracy and Product Depth

| Field | Value |
|---|---|
| Branch | `milestone/M-046-intelligence-accuracy` |
| Status | In Progress |
| Depends on | M-032 (Cursor overlay), M-025 (Core SDK freeze), M-044 (Backend report) |
| Unlocks | Accurate Overview/DNA/Trends; Testing & Security surface; domain depth; opt-in integrations |
| Packages | `@repo-prism/app-shell` (new), `@repo-prism/ui`, `@repo-prism/core`, `@repo-prism/intelligence`, `@repo-prism/impact`, `@repo-prism/shared`, `vscode-extension`, `playground` |
| ADRs | ADR-0021, ADR-0022, ADR-0023, ADR-0024 |

## Goal

Close intelligence-accuracy gaps and deepen product surfaces in one epic:
consolidate duplicated playground / IDE webview UI into **`@repo-prism/app-shell`**,
add real design-system primitives, then ship accuracy and depth across Overview,
DNA, Trends, Testing & Security, Blast, Settings, Integrations, and domain
screens — in **three internal phases** on a single branch.

## In Scope

### Phase 1 — UI primitives, app-shell, Overview / DNA / Trends

- Design-system primitives in `@repo-prism/ui` (Input, SearchableInput, Select,
  Textarea, ToggleGroup, Tabs, Tooltip) + light theme + density tokens
- Extract shared screens into `@repo-prism/app-shell`; playground + VS Code / Cursor
  consume it (delete duplicates)
- Core helpers: confidence-ranked domains / primary domain, health-factor
  breakdown, trends history store + git commit backfill, audit event stream
- Overview accuracy (clickable KPIs, regions, Most Connected, domains, activity,
  profile, sync)
- DNA / Profile polish (tooltips, Show Breakdown, tech icons, layout, calc review)
- Trends (health-over-time + filters, region movers, disclaimer copy)
- Repository Map: **light-theme rendering fix only** (no feature audit)

### Phase 2 — Testing / Security, Blast, Settings, Integrations

- Core `getTestingReport()` / `getSecurityReport()`; Testing & Security tab
  (below Domains); Overview dual-stat card; recompute Test Presence
- Blast Radius risk bands, config-file impact, symbol/rename UX, metrics/hints
- Settings: display name, Clear Data, Auto Re-Index, Exclude, max file size,
  theme/density, telemetry stub, Allow network integrations, audit logs
- Integrations framework + opt-in GitHub / PageSpeed connectors; wire Eng Health
  + Code Explorer into UI
- Closes / supersedes **M-024 Engineering Insights** (Most Connected / insights)

### Phase 3 — Domain deep implementations (opt-in network)

- Common domain UX: SearchableInput filters, card tooltips, findings empty
  states, Analyse / last-run refresh
- DevOps: live CI (GitHub + Other Repo; Argo/Jenkins scaffolds), pipelines filter
- Frontend: local Lighthouse / CWV + PageSpeed (opt-in), import helper text
- Mobile: Navigation Topology, composition, filters
- Backend: function names, data-layer counts, env/integration split, filters
- Desktop: IPC channels, boundary links, stack ordering, filters

## Out of Scope

- Repository Map **feature** audit (light theme fix only in Phase 1)
- Marketplace / Open VSX publish
- MCP / CLI implementation (M-026+) — Core DTOs remain the source of truth
- Argo / Jenkins full live connectors beyond scaffolds (Phase 3 scaffolds only)

## Notes

- **Supersedes M-024 Engineering Insights** — ranked-signal / Most Connected
  work lives here; PROGRESS marks M-024 `Deferred` / superseded.
- Network features are gated by Settings **Allow network integrations**
  (ADR-0024). Default remains local-first (ADR-0004).
- Trends history: forward snapshots **plus** git commit backfill job (ADR-0023).
- One branch; verify at each phase boundary; commit only on owner approval.

## Definition of Done

### Phase 1

- [x] `@repo-prism/ui` primitives + light/density tokens; Map light theme no regression
- [x] `@repo-prism/app-shell` owns screens; playground + extension import it
- [x] Ranked domains, health breakdown, history store + backfill, audit stream
- [x] Overview / DNA / Trends accuracy items from epic §1d–1f
- [x] `bun run verify:milestone` green at phase boundary

### Phase 2

- [x] `getTestingReport` / `getSecurityReport` + Testing & Security tab + dual-stat Overview
- [x] Blast / Settings / Integrations epic items; Eng Health + Code Explorer wired
- [x] M-024 marked superseded in PROGRESS
- [x] `bun run verify:milestone` green at phase boundary

### Phase 3

- [x] Domain deep implementations (DevOps / Frontend / Mobile / Backend / Desktop)
- [x] Opt-in network connectors respect Allow network integrations
- [x] `bun run verify:milestone` green; owner approval → commit → merge → Verified

## Verification

`bun run verify:milestone` · Manual smoke on a multi-domain git repo (and a
mobile repo) per the epic audit checklist, at each phase boundary.

**Status note (2026-07-24):** Owner approved; committed and merged to `main`.
