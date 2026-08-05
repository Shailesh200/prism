# ADR-0015: Backend Intelligence — route-level API surface & domain heuristics

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-22 |
| Decision makers | Owner, Architect |
| Related milestones | M-044 |
| Supersedes | — |

## Context

The Backend domain screen (M-043) reuses existing Core signals — the
`api-surface` utility overlay (handler/route-table/openapi/proto **files**), the
`security-surface` and `qa-test-gaps` overlays, the dependency graph
(`getDependencyGraph`), and local git history. That is enough for a
file-granular view (detected surface, composition, most-depended-on, churn,
security files, heuristic test coverage), but a backend engineer really wants
**route-granular** intelligence that Core does not compute today:

- Individual endpoints as `METHOD /path` (not just the files that declare them).
- Whether each route is public or requires auth.
- The data layer (models, migrations, raw SQL, DB clients) and which endpoints
  touch it.
- External integrations and the **required environment variables** to run.
- Background work (queues, workers, cron).
- Spec drift (routes in code vs. an OpenAPI/proto contract).

These are genuine **analysis** additions and, per ADR-0004, must live in Core
(`@repo-prism/intelligence`) and be exposed via `@repo-prism/core` DTOs — never computed in
a surface (the playground's current cross-referencing is a stopgap for reused
signals only). This ADR proposes the Core heuristics and their contract.

## Decision

Extend the `api-surface` overlay builder (and add sibling extractors) in
`@repo-prism/intelligence` to emit **route-level** nodes plus new backend facets,
surfaced through a typed `BackendReport` DTO in `@repo-prism/shared` and a
`getBackendReport()` (or extended `getUtilityOverlay("api-surface")`) Core API.
All extraction stays local, static, and heuristic (regex/AST over already-indexed
files) with explicit `evidence` and `confidence`, honoring the no-network rule.

## Options Considered

### Option A — Extend `api-surface` overlay in place (richer nodes + findings)

- Pros: reuses the existing overlay contract/registry; Map/MCP get it for free;
  smallest surface-area change.
- Cons: overlay graph DTO is generic (nodes/edges); route metadata (method,
  auth, tested) must ride in `attrs`, which is loosely typed.

### Option B — New dedicated `BackendReport` DTO + `getBackendReport()` API

- Pros: strongly-typed endpoints (`method`, `path`, `handlerFile`, `auth`,
  `tested`, `dependents`), data-layer and env facets; cleaner for UI/MCP.
- Cons: new Core API + schema surface; some duplication with the overlay graph.

### Option C — Hybrid (recommended)

- Keep the `api-surface` overlay for the Map/graph, and add a typed
  `BackendReport` (Option B) for the domain screen + MCP. Route extraction is
  shared internally; the report references overlay node ids.

## Consequences

- Positive: route-granular backend view; MCP tools can answer "list endpoints
  without auth/tests"; UI stops doing cross-referencing (moves to Core).
- Negative: more Core heuristics to maintain per framework (Express/Nest/Fastify/
  gin/Flask/etc.); confidence varies by framework.
- Follow-ups: per-framework extractors added incrementally behind a registry;
  playground's client-side joins retired once `BackendReport` lands.

## Compliance

- [ ] Updates Master Plan if roadmap impacted
- [ ] Updates package README(s) if API impacted
- [x] Linked from milestone doc (M-044)

## Notes

Scope guard: this is **not** part of M-043 (UI fine-tune). M-043 ships only the
reused-signal cards. Route-level heuristics are gated behind M-044 and this ADR.
