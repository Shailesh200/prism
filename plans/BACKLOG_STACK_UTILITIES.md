# Backlog — Stack-aware repository utilities

> **Status:** Backlog (owner-approved direction 2026-07-20)  
> **Do not implement from this list until a milestone phase explicitly pulls items In Scope.**  
> **Decisions:** [ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)  
> **SPI foundation:** M-040 · **DNA packs:** M-013 · **Utilities epic:** [M-041](./milestones/M-041_stack-utilities-foundation.md) (all domains + monorepo; Gate A before M-018)

Artifacts stay **local**. Runners / remote APIs are **consent-based**. No Prism Cloud.

**Phase map (M-041):** P0 foundation · P1 FE/web · Mono-v1 · P2 BE · P3 mobile · P4 desktop · P5 ML/data eng · P6 DevOps · P7 embedded/game/QA/SEC · Mono-v2.

---

## Cross-cutting (all domains)

| ID | Item | Notes | Phase |
|---|---|---|---|
| X-01 | Ingest SPI for measurement reports (JSON schemas in `@repo-prism/shared`) | **Done** M-041 | P0 |
| X-02 | Local artifact store under `.prism/ingest/` (gitignored) | **Done** M-041 | P0 |
| X-03 | Async job UX: start → progress → ready report | **Done** M-041 | P0 |
| X-04 | Persona-default Map / insights presets | **Done** M-041 | P0 / Mono-v1 |
| X-05 | MCP tools for stack profile + latest ingest summaries | After Core APIs exist | Later |
| X-06 | Consent gate component for any network-backed probe | **Done** M-041 | P0 |

---

## Monorepo / multi-domain workspace

| ID | Item | Priority | Phase |
|---|---|---|---|
| MR-01 | Per-package stack profile detection (apps/*, packages/*, language roots) | **Done** M-041 | Mono-v1 |
| MR-02 | Workspace rollup: domains[], personas[], packages[] | **Done** M-041 | Mono-v1 |
| MR-03 | Core package selector for utilities / overlays | **Done** M-041 | Mono-v1 |
| MR-04 | Additive multi-domain (no single-winner at workspace) | **Done** M-041 | Mono-v1 |
| MR-05 | Tooling signals (pnpm/turbo/nx/moon workspaces) on rollup | **Done** M-041 | Mono-v1 |
| MR-06 | Cross-package blast defaults / shared-lib impact | **Done** M-041 (overlay scaffold) | Mono-v2 |
| MR-07 | Domain-colored Map regions for multi-app workspaces | **Done** M-041 (overlay DTO) | Mono-v2 |

---

## Frontend / web

| ID | Item | Priority | Phase |
|---|---|---|---|
| FE-01 | Opt-in local Lighthouse runner (dedicated PORT, async, callout) | **Done** M-041 | P1 |
| FE-02 | CWV report model: LCP, CLS, INP (+ future vitals) | **Done** M-041 | P1 |
| FE-03 | Rollups: app → route → chunk → **component** (when attributable) | **Done** M-041 | P1 |
| FE-04 | SEO score / SEO audits overlay | Later | P1+ |
| FE-05 | Full LH category scores (Perf, A11y, BP, SEO) on Map/Inspector | Later | P1+ |
| FE-06 | Bundle / code-split hotspot layer (build stats ingest) | **In Progress** M-050 (Domain Bundle/Weight + ingest; Map layer later) | P1+ |
| FE-07 | Framework lenses (Next/Vite/Remix route graphs) | Later | P1+ |
| FE-08 | Optional consent-based PageSpeed API | Later (never default) | P1+ |

---

## Backend / API

| ID | Item | Priority | Phase |
|---|---|---|---|
| BE-01 | API / RPC surface inventory (OpenAPI, route tables, gRPC) | **Done** M-041 (`api-surface`) | P2 |
| BE-02 | Handler-level blast-radius defaults | Later | P2 |
| BE-03 | Test-gap on API surface | Later | P2 |
| BE-04 | Config/secret path caution layer | Later | P2 |
| BE-05 | Optional local OTEL/Prometheus export ingest (p95/error overlays) | Later | P2 |

---

## Mobile (RN / Expo / Flutter / native)

| ID | Item | Priority | Phase |
|---|---|---|---|
| MO-01 | Screen / navigation graph layer | **Done** M-041 (`mobile-nav`) | P3 |
| MO-02 | Native module / bridge risk | Later | P3 |
| MO-03 | Platform split (iOS/Android-only paths) | Later | P3 |
| MO-04 | Asset/binary weight hotspots | Later | P3 |
| MO-05 | Startup import criticality | Later | P3 |
| MO-06 | Deep-link / permission manifest inventory | Later | P3 |
| MO-07 | E2E coverage overlay (Detox/Maestro/…) | Later | P3 |

---

## Desktop (Electron / Tauri / …)

| ID | Item | Priority | Phase |
|---|---|---|---|
| DT-01 | Main vs renderer / IPC boundary map | **Done** M-041 (`desktop-boundary`) | P4 |
| DT-02 | Preload / privilege surface | Later | P4 |
| DT-03 | Packaging / updater config inventory | Later | P4 |

---

## Data / ML / AI

| ID | Item | Priority | Phase |
|---|---|---|---|
| ML-01 | Notebook ↔ module graph | **Done** M-041 (`notebook-modules`) | P5 |
| ML-02 | Train vs serve region split | Later | P5 |
| ML-03 | Experiment / artifact directory signals | Later | P5 |
| ML-04 | Prompt / eval / RAG layout regions | Later | P5 |
| ML-05 | Pipeline stage map (ingest → train → deploy) | Later | P5 |

---

## Data engineering

| ID | Item | Priority | Phase |
|---|---|---|---|
| DE-01 | Job/DAG dependency view (Airflow/dbt/Spark defs) | **Done** M-041 (`data-pipeline-dag`) | P5 |
| DE-02 | dbt-style model lineage | Later | P5 |

---

## DevOps / platform / SRE

| ID | Item | Priority | Phase |
|---|---|---|---|
| DO-01 | IaC resource map (Terraform/K8s/Helm) | **Done** M-041 (`iac-resources`) | P6 |
| DO-02 | CI workflow criticality | Later | P6 |
| DO-03 | App↔infra blast touchpoints | Later | P6 |

---

## Embedded / game / QA / security

| ID | Item | Priority | Phase |
|---|---|---|---|
| EM-01 | Firmware vs host test regions | **Done** M-041 (`embedded-regions`) | P7 |
| GM-01 | Engine content vs code regions | **Done** M-041 (`game-regions`) | P7 |
| QA-01 | Test-only package / e2e gap overlays | **Done** M-041 (`qa-test-gaps`) | P7 |
| SEC-01 | Auth/crypto concentration + policy-as-code presence | **Done** M-041 (`security-surface`) | P7 |

---

## How to promote an item

1. Owner picks IDs into a milestone **In Scope**  
2. Update that milestone DoD  
3. Implement on `milestone/M-XXX-…` only  
4. Mark row **Done** here with milestone id  

---

## Owner decisions log

| Date | Decision |
|---|---|
| 2026-07-20 | Lighthouse = opt-in local runner + async UX callout (ADR-0008 D1) |
| 2026-07-20 | CWV attribution may reach component level; not LCP-only (D2) |
| 2026-07-20 | Utilities epic before M-018 Map UI; Map after Gate A (D3 amended) |
| 2026-07-20 | Local reports only; consent for remote perf; no Prism Cloud (D4) |
| 2026-07-20 | Domain feature lists are backlog — grow over time |
| 2026-07-20 | M-041 owns **all** domain packs + multi-domain monorepo (D5 / Q-021) |
| 2026-07-20 | M-041: all phases on `milestone/M-041-stack-utilities` (no per-phase branch waits) |
