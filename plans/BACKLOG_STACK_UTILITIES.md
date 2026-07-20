# Backlog — Stack-aware repository utilities

> **Status:** Backlog (owner-approved direction 2026-07-20)  
> **Do not implement from this list until a milestone explicitly pulls items In Scope.**  
> **Decisions:** [ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)  
> **SPI foundation:** M-040 · **DNA packs:** M-013 · **Utilities epic:** M-041+ (before M-018)

Artifacts stay **local**. Runners / remote APIs are **consent-based**. No Prism Cloud.

---

## Cross-cutting (all domains)

| ID | Item | Notes |
|---|---|---|
| X-01 | Ingest SPI for measurement reports (JSON schemas in `@prism/shared`) | Lighthouse, coverage, OTEL summaries, etc. |
| X-02 | Local artifact store under `.prism/ingest/` (gitignored) | Path override allowed |
| X-03 | Async job UX: start → progress → ready report | Shared pattern for Lighthouse and later runners |
| X-04 | Persona-default Map / insights presets | From StackProfile |
| X-05 | MCP tools for stack profile + latest ingest summaries | After Core APIs exist |
| X-06 | Consent gate component for any network-backed probe | PageSpeed etc. |

---

## Frontend / web

| ID | Item | Priority |
|---|---|---|
| FE-01 | Opt-in local Lighthouse runner (dedicated PORT, async, callout) | Epic foundation |
| FE-02 | CWV report model: LCP, CLS, INP (+ future vitals) | Epic foundation |
| FE-03 | Rollups: app → route → chunk → **component** (when attributable) | Epic foundation |
| FE-04 | SEO score / SEO audits overlay | Later |
| FE-05 | Full LH category scores (Perf, A11y, BP, SEO) on Map/Inspector | Later |
| FE-06 | Bundle / code-split hotspot layer (build stats ingest) | Later |
| FE-07 | Framework lenses (Next/Vite/Remix route graphs) | Later |
| FE-08 | Optional consent-based PageSpeed API | Later (never default) |

---

## Backend / API

| ID | Item | Priority |
|---|---|---|
| BE-01 | API / RPC surface inventory (OpenAPI, route tables, gRPC) | Later pack |
| BE-02 | Handler-level blast-radius defaults | Later |
| BE-03 | Test-gap on API surface | Later |
| BE-04 | Config/secret path caution layer | Later |
| BE-05 | Optional local OTEL/Prometheus export ingest (p95/error overlays) | Later |

---

## Mobile (RN / Expo / Flutter / native)

| ID | Item | Priority |
|---|---|---|
| MO-01 | Screen / navigation graph layer | Later pack |
| MO-02 | Native module / bridge risk | Later |
| MO-03 | Platform split (iOS/Android-only paths) | Later |
| MO-04 | Asset/binary weight hotspots | Later |
| MO-05 | Startup import criticality | Later |
| MO-06 | Deep-link / permission manifest inventory | Later |
| MO-07 | E2E coverage overlay (Detox/Maestro/…) | Later |

---

## Desktop (Electron / Tauri / …)

| ID | Item | Priority |
|---|---|---|
| DT-01 | Main vs renderer / IPC boundary map | Later pack |
| DT-02 | Preload / privilege surface | Later |
| DT-03 | Packaging / updater config inventory | Later |

---

## Data / ML / AI

| ID | Item | Priority |
|---|---|---|
| ML-01 | Notebook ↔ module graph | Later pack |
| ML-02 | Train vs serve region split | Later |
| ML-03 | Experiment / artifact directory signals | Later |
| ML-04 | Prompt / eval / RAG layout regions | Later |
| ML-05 | Pipeline stage map (ingest → train → deploy) | Later |

---

## Data engineering

| ID | Item | Priority |
|---|---|---|
| DE-01 | Job/DAG dependency view (Airflow/dbt/Spark defs) | Later pack |
| DE-02 | dbt-style model lineage | Later |

---

## DevOps / platform / SRE

| ID | Item | Priority |
|---|---|---|
| DO-01 | IaC resource map (Terraform/K8s/Helm) | Later pack |
| DO-02 | CI workflow criticality | Later |
| DO-03 | App↔infra blast touchpoints | Later |

---

## Embedded / game / QA / security

| ID | Item | Priority |
|---|---|---|
| EM-01 | Firmware vs host test regions | Later |
| GM-01 | Engine content vs code regions | Later |
| QA-01 | Test-only package / e2e gap overlays | Later |
| SEC-01 | Auth/crypto concentration + policy-as-code presence | Later |

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
| 2026-07-20 | Utilities epic before M-018 Map UI (D3) |
| 2026-07-20 | Local reports only; consent for remote perf; no Prism Cloud (D4) |
| 2026-07-20 | Domain feature lists are backlog — grow over time |
