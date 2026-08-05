# ADR-0028: Frontend Bundle Weight ingest + local analyze runner

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-30 |
| Decision makers | Owner |
| Related milestones | M-050 |
| Related | ADR-0008 (measurement utilities), ADR-0004 (Core-only / local-first) |
| Supersedes | — |

## Context

Frontend Bundle / Weight (backlog FE-06) needs real production-ish asset sizes from bundler stats — not import-graph heuristics. CWV already established opt-in local jobs, `.prism/ingest/`, consent, and DomainScreen panels (ADR-0008). Bundle analysis additionally requires spawning package-manager scripts (or Prism-managed analyzer config) which may install tools and run builds.

## Decision

1. **Ingest kind** `bundle-stats` stores a typed `BundleWeightReport` under `.prism/ingest/` (same store as `lighthouse-cwv`).
2. **Utility job** `bundle-stats` is consent-gated (purpose = job kind). Prefer the project’s existing `analyze` (or equivalent) script when detected; otherwise Prism-managed local analyze for detectable Next / Vite / Webpack stacks. Timeouts and package picker for monorepos.
3. **Core surface**: `detectBundleAnalyzeCapability`, `startUtilityJob({ kind: "bundle-stats", bundleAnalyze })`, `getBundleWeightReport(artifactId)`. UI/MCP/CLI only via Core.
4. **Honesty**: never invent sizes from the dependency graph. Empty / unsupported states when no stats can be produced or parsed. Optional discover of fresh local analyzer output after a run is assist-only; no primary “import JSON” UX.
5. **No silent network**: builds run only after consent; Core analysis paths remain network-free.

## Options Considered

### Option A — Job + ingest mirror of CWV (chosen)

- Pros: reuses utilities session, consent, DomainScreen patterns; typed DTOs.
- Cons: another job kind to maintain.

### Option B — Ingest-only (user always supplies stats)

- Pros: simpler runner.
- Cons: weak one-click UX; owner rejected primary import UX.

### Option C — Always Prism-managed analyzer config rewrite

- Pros: consistent output shape.
- Cons: invasive; ignores existing project scripts.

## Consequences

- Positive: one-click Analyze beside CWV; real chunk/module treemap
- Positive: parsers stay in `@repo-prism/intelligence`; hosts stay thin
- Negative: Prism-managed path is best-effort for Next/Vite/Webpack only
- Follow-up: Map hotspot layer / more bundlers later (FE-06 expansion)

## Compliance

- [x] Linked from milestone doc (M-050)
- [x] Updates CORE_SDK stability table for new workspace methods
- [ ] Master Plan roadmap note optional (FE-06 Done)

## Notes

Implementation lands on `milestone/M-050-bundle-weight`. Proposed → Accepted with this slice.
