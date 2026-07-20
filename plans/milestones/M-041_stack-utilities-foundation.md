# M-041 — Stack-aware utilities epic (all domains + monorepo)

| Field | Value |
|---|---|
| Branch | `milestone/M-041-…` (one branch **per phase** — see §Delivery) |
| Status | Not Started |
| Depends on | M-014 (Intelligence API), M-040, M-013 (DNA detectors for real signals) |
| Unlocks | M-017 / M-018 (after **Phase 0 + Phase 1 + Mono-v1**); richer Map layers as later phases land |
| Packages | `@prism/intelligence`, `@prism/shared`, `@prism/core`, `@prism/cli` (runners), later surface hooks |

## Goal

Own **all stack-aware repository utilities** — frontend, backend, mobile, desktop, data/ML/AI, data engineering, DevOps/platform, embedded, game, QA/security — plus **first-class multi-domain monorepos**, per [ADR-0008](../adr/0008-stack-aware-measurement-utilities.md).

Feature inventory: [`BACKLOG_STACK_UTILITIES.md`](../BACKLOG_STACK_UTILITIES.md).  
This epic **plans and ships** those capabilities in phases (not a single endless PR).

## Multi-domain monorepo (required)

Many Prism users will open a **workspace with several domains at once** (e.g. Next.js app + Nest API + Terraform + notebooks).

| Requirement | Detail |
|---|---|
| **Per-package profiles** | Detect stack/persona per package/app root (`package.json`, `go.mod`, `pyproject.toml`, `apps/*`, `packages/*`, …) |
| **Workspace rollup** | Aggregate `StackProfile`: `domains[]`, `personas[]`, `packages[]` with per-package signals |
| **Scoped utilities** | Runners/overlays target a **selected package** (or “all apps”); never assume single-app repo |
| **Map / MCP context** | Default view = workspace summary; drill into package; filters by domain/persona |
| **Conflicting stacks** | Additive signals; no single-winner domain at workspace level |
| **Tooling domain** | Monorepo tools (moon/turbo/nx/pnpm workspaces) always contribute `tooling` signals |

**Mono-v1** (unblocks Map): workspace rollup + per-package profile list + select-package in Core API.  
**Mono-v2+**: cross-package blast defaults, shared-lib impact, domain-colored Map regions.

## Epic phases (all in M-041 scope)

| Phase | Name | Focus | Unblocks Map? |
|---|---|---|---|
| **P0** | Foundation | Ingest store, async job model, consent stub, Core job APIs | Needed |
| **P1** | Frontend / web | Opt-in Lighthouse, CWV (LCP/CLS/INP…), attribution app→route→chunk→component; SEO backlog items as they land | Needed |
| **Mono-v1** | Monorepo multi-domain | Per-package + workspace `StackProfile`; package selector | Needed |
| **P2** | Backend / API | Surface inventory, handler lenses, test-gap, config caution (see backlog BE-*) | Later in epic |
| **P3** | Mobile | Nav/screen graph, native bridge risk, assets, permissions (MO-*) | Later |
| **P4** | Desktop | Main/renderer, IPC/preload (DT-*) | Later |
| **P5** | Data / ML / AI + data eng | Notebooks, train/serve, pipelines, DAG/lineage (ML-*, DE-*) | Later |
| **P6** | DevOps / platform | IaC map, CI criticality, app↔infra touchpoints (DO-*) | Later |
| **P7** | Embedded / game / QA / security | EM/GM/QA/SEC backlog | Later |
| **Mono-v2** | Monorepo advanced | Cross-package impact, shared libs, domain regions on Map | Later |

Cross-cutting backlog **X-*** items land in P0 and are reused by every phase.

## Delivery model (Hard Rules compatible)

- **One phase = one git branch** from latest `main`, e.g. `milestone/M-041-p0-foundation`, `milestone/M-041-p2-backend`.
- Owner **approve → commit → merge** per phase (same as any milestone).
- PROGRESS row stays **M-041** until the epic is complete; Notes column tracks active phase.
- **Map UI (M-017/M-018) may start after P0 + P1 + Mono-v1** are Verified — do not wait for P2–P7.
- New backlog rows can be added anytime; they attach to the matching phase.

## In Scope (epic-wide)

- All domain packs listed above and in the backlog doc  
- Multi-domain monorepo model (Mono-v1 required early; Mono-v2 later)  
- Local artifacts only; opt-in runners; consent for any remote probe  
- Core APIs consumed by Map/MCP/CLI (surfaces remain thin)

## Out of Scope

- Prism Cloud / silent network from Core  
- Full Map UI implementation (M-018) — Map **consumes** utilities overlays  
- Fake component-level (or domain) metrics when evidence is missing  
- Replacing language parsers (M-006 / M-034) — utilities use DNA + inventory + lab ingest

## Definition of Done (epic)

### Gate A — Unblock Map (must finish first)

- [ ] P0 foundation verified  
- [ ] P1 web utilities (Lighthouse opt-in + CWV model) verified  
- [ ] Mono-v1 (per-package + workspace rollup + package selector) verified  
- [ ] Overlay DTOs agreed for M-017  

### Gate B — Epic complete

- [ ] Phases P2–P7 each verified at least at **scaffold + primary backlog slice** (not every Later row)  
- [ ] Mono-v2 or explicitly Deferred with owner note  
- [ ] Backlog promotion rules followed  
- [ ] PROGRESS → Verified; owner approved  

## Verification (each phase)

`bun run verify:milestone` · phase fixture(s) · privacy check (no surprise network) · short **what changed** snippet after merge

## See also

- [BACKLOG_STACK_UTILITIES.md](../BACKLOG_STACK_UTILITIES.md)  
- [ADR-0008](../adr/0008-stack-aware-measurement-utilities.md)  
- [M-040 Stack Detector SPI](./M-040_stack-detector-spi.md)  
- [M-013 Repository DNA](./M-013_repository-dna.md)  
