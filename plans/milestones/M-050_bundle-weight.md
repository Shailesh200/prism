# M-050 — Frontend Bundle Weight

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-050-bundle-weight` |
| Related ADR | [ADR-0028](../adr/0028-frontend-bundle-weight-ingest.md) (**Accepted**) |
| Backlog | FE-06 (bundle / code-split hotspot) |

## Goal

Ship **Frontend Bundle / Weight** beside the existing CWV lab: detect project analyze scripts, one-click local Analyze (prefer project script; else Prism-managed for Next / Vite / Webpack), ingest real build stats under `.prism/ingest/`, and render overview + treemap + chunk/module drill-in — never fake production sizes from the import graph.

## In scope

1. Shared Zod DTOs: `BundleWeightReport` (+ chunks, modules, package rollups, highlights, build label).
2. Ingest kind `bundle-stats` + utility job `bundle-stats` (consent-gated; spawn local package-manager scripts).
3. Detect analyze capability (`analyze` script, `@next/bundle-analyzer`, `rollup-plugin-visualizer`, webpack/vite/esbuild markers).
4. Parsers: webpack stats, rollup-plugin-visualizer JSON, esbuild metafile (Next structured output when present).
5. Core: `detectBundleAnalyzeCapability`, `getBundleWeightReport`; Analyze via `startUtilityJob({ kind: "bundle-stats", … })`.
6. Frontend DomainScreen **Bundle / Weight** section (treemap + tables + empty/unsupported states).
7. Host bridges (extension session + playground) mirroring Lighthouse.
8. Tests for parsers + DTOs; `bun run verify:milestone` green.

## Out of scope

- Every exotic bundler / Prism-run for unsupported stacks
- Backend weight packs (empty placeholder OK)
- Map deep-link (defer unless cheap)
- Graph-based fake “production” treemap
- Primary “import JSON” UX (optional discover of fresh local analyze output after run is OK)

## DoD

- [x] Milestone In Progress; only one In Progress
- [x] ADR-0028 Accepted with implementation notes
- [x] Surfaces only via `@repo-prism/core`
- [x] Consent required before running builds; no silent network
- [x] Honest empty/unsupported states
- [x] `bun run verify:milestone` green
- [x] Manual smoke: Frontend domain → Analyze → treemap — **waived by owner 2026-08-05**, approved as-is without running the checklist below

## Smoke notes (manual)

1. Open playground / extension → Domains → Frontend.
2. Confirm **Bundle / Weight** section under CWV lab.
3. Click **Analyze** (consent) on a Next/Vite/Webpack app with an `analyze` script or supported stack.
4. Expect overview tiles, treemap by chunk, chunk table, module drill-in, highlights.
5. Unsupported repo shows clear empty state (no fabricated sizes).
6. Optional: `mode=ingest` via Core with a webpack `stats.json` for offline validation.
