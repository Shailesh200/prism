# M-041 — Stack-aware utilities epic (all domains + monorepo)

| Field | Value |
|---|---|
| Branch | `milestone/M-041-stack-utilities` (owner: **all phases on one branch**) |
| Status | Verified |
| Depends on | M-014 (Intelligence API), M-040, M-013 (DNA detectors for real signals) |
| Unlocks | M-017 / M-018 (Gate A done); richer Map layers via utility overlays |
| Packages | `@prism/intelligence`, `@prism/shared`, `@prism/core` |

## Goal

Own **all stack-aware repository utilities** — frontend, backend, mobile, desktop, data/ML/AI, data engineering, DevOps/platform, embedded, game, QA/security — plus **first-class multi-domain monorepos**, per [ADR-0008](../adr/0008-stack-aware-measurement-utilities.md).

Feature inventory: [`BACKLOG_STACK_UTILITIES.md`](../BACKLOG_STACK_UTILITIES.md).  
Map overlay contract: [`guides/UTILITY_OVERLAYS.md`](../guides/UTILITY_OVERLAYS.md).

## Delivery model (this epic)

Owner override 2026-07-20: **single branch** `milestone/M-041-stack-utilities` for P0 → Mono-v2 (no per-phase branches / mid-epic approve waits). Merge to `main` still requires explicit owner approve.

## Epic phases

| Phase | Focus | Status |
|---|---|---|
| **P0** | Ingest, jobs, consent, persona presets | Done |
| **P1** | Lighthouse / CWV / attribution | Done |
| **Mono-v1** | Per-package + workspace rollup + selector | Done |
| **P2** | BE-01 API surface overlay | Done |
| **P3** | MO-01 mobile nav overlay | Done |
| **P4** | DT-01 desktop boundary overlay | Done |
| **P5** | ML-01 + DE-01 notebook / DAG overlays | Done |
| **P6** | DO-01 IaC overlay | Done |
| **P7** | EM/GM/QA/SEC overlays | Done |
| **Mono-v2** | MR-06 cross-package impact + MR-07 domain regions | Done |

## Definition of Done (epic)

### Gate A — Unblock Map

- [x] P0 foundation verified
- [x] P1 web utilities verified
- [x] Mono-v1 verified
- [x] Overlay DTOs agreed for M-017 — [`guides/UTILITY_OVERLAYS.md`](../guides/UTILITY_OVERLAYS.md)

### Gate B — Epic complete

- [x] Phases P2–P7 scaffold + primary backlog slice (`getUtilityOverlay` kinds)
- [x] Mono-v2 (MR-06 requires `index()`; MR-07 `domain-regions`)
- [x] Backlog rows marked Done for primary slices
- [x] `bun run verify:milestone` green
- [x] Owner approve → commit → merge to `main`

### Core APIs shipped

- Utilities: jobs, ingest, consent, CWV, persona presets  
- Mono: `listPackages` / `selectPackage` / `getStackProfile`  
- Overlays: `listUtilityOverlayKinds` / `getUtilityOverlay(kind)`

## Verification

`bun run verify:milestone` · fixtures `m013-*`, `m041-overlays` · no surprise network

## See also

- [BACKLOG_STACK_UTILITIES.md](../BACKLOG_STACK_UTILITIES.md)  
- [ADR-0008](../adr/0008-stack-aware-measurement-utilities.md)  
- [UTILITY_OVERLAYS.md](../guides/UTILITY_OVERLAYS.md)  
