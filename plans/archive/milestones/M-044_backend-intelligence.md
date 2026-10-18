# M-044 — Backend Intelligence (route-level API surface)

| Field | Value |
|---|---|
| Branch | `milestone/M-044-backend-intelligence` |
| Status | Verified |
| Depends on | M-043, M-041 (utility overlays), M-020 (impact) |
| Unlocks | Route-level MCP tools, backend health scoring |
| Packages | `@repo-prism/intelligence`, `@repo-prism/shared`, `@repo-prism/core`, `apps/playground` |
| ADR | ADR-0015 |

## Goal

Move the Backend domain view from **file-granular** (what M-043 ships by reusing
existing signals) to **route-granular** intelligence, with all analysis in Core
(`@repo-prism/intelligence`) exposed via typed `@repo-prism/shared` DTOs. No network; all
heuristics are static/AST/regex over the existing index, with `evidence` +
`confidence` on every inference (ADR-0004, ADR-0011, ADR-0015).

## Context — what M-043 already ships (do NOT redo)

The Backend screen already reuses Core signals via the playground:

- **API surface** (`api-surface` overlay): handler / route-table / openapi /
  proto **files**, composition breakdown, detected-surface table.
- **Endpoint test coverage** — heuristic join of handler file names ↔
  `qa-test-gaps` test files (untested handlers highlighted).
- **Security surface** — `security-surface` overlay files/findings.
- **Churn hotspots** — handlers ranked by local git commit counts
  (`getGitActivity`).
- **Most depended-on** — handler in-degree from `getDependencyGraph`.

These are surface-side joins over Core DTOs. M-044 replaces the heuristic joins
with first-class Core analysis and adds the facets Core cannot infer today.

## In Scope

- **Route extraction** → endpoints as `METHOD /path` with `handlerFile`,
  `framework`, `evidence`, `confidence`. Initial extractors: Express, NestJS,
  Fastify (Node), behind a per-framework registry (SPI, ADR-0007 style).
- **Auth / exposure** heuristic per route (guard/middleware/decorator detection):
  `public | authenticated | unknown`.
- **Test linkage** per route (replaces the M-043 filename heuristic): map routes
  to tests via import/reference edges, not just names.
- **Data layer facet**: models, migrations, raw SQL, DB clients; link endpoints
  that reach the data layer.
- **Env & integrations facet**: required env vars (`process.env.*` / `os.environ`)
  and third-party SDK/outbound-call detection.
- **Background work facet**: queues / workers / cron.
- **Contract/DTO**: `BackendReport` in `@repo-prism/shared` + `getBackendReport()` in
  `@repo-prism/core` (hybrid Option C — overlay stays for the Map; typed report for
  the domain screen + MCP).
- **MCP**: one tool returning `BackendReport` JSON (Core-only).
- **UI**: swap the playground's client-side joins for `getBackendReport()`; add a
  route table (method/path/auth/tested) and data-layer/env cards.

## Out of Scope

- Non-Node frameworks (gin/Flask/Rails/Spring) — follow-up extractors.
- OpenAPI **spec-drift** diffing — separate milestone once extraction is stable.
- Runtime/dynamic analysis — static only.

## Definition of Done

- `BackendReport` schema + `getBackendReport()` with fixtures and unit tests per
  extractor (Express/Nest/Fastify).
- Playground Backend screen reads `getBackendReport()`; heuristic joins removed.
- MCP tool returns Core DTO; `bun run verify:milestone` green.
- ADR-0015 accepted; Master Plan / PROGRESS updated.

## Notes

Sequenced after M-043 review. Route-level heuristics are explicitly gated here so
M-043 stays scoped to reused-signal UI.
