# ADR-0008: Stack-aware measurement utilities (owner decisions 2026-07-20)

| Field | Value |
|---|---|
| Status | **Accepted** (amended 2026-07-20 — full epic + monorepo) |
| Date | 2026-07-20 |
| Decision makers | Owner |
| Related milestones | M-040, M-013, M-014, **M-041** (utilities epic), M-017, M-018 |
| Resolves | Q-017, Q-018, Q-019, Q-020, Q-021 |
| Related backlog | [`BACKLOG_STACK_UTILITIES.md`](../BACKLOG_STACK_UTILITIES.md) |
| Epic doc | [`M-041_stack-utilities-foundation.md`](../milestones/M-041_stack-utilities-foundation.md) |

## Context

Stack detection (M-040 / M-013) enables persona-aware product surfaces. Owner wants web perf (Lighthouse, CWV, SEO), deep attribution (including component-level CWV), and **analogous utilities for every domain** (BE, mobile, desktop, ML, DevOps, …) — without a Prism Cloud.

Real repositories are often **multi-domain monorepos** (e.g. Next app + API + Terraform + notebooks). Utilities and Map must not assume a single-app workspace.

## Decisions

### D1 — Web perf runner: opt-in local Lighthouse (Option B)

- Prism may **run Lighthouse (or equivalent) locally** when the user consents.
- UX **callout** before start must state prerequisites, e.g.:
  - app will be served / probed on a **dedicated local PORT**
  - diagnosis runs **asynchronously**
  - report is shown **when ready** (progress + completion)
- Core analysis paths stay free of surprise network I/O.
- **SEO scores, CWV pack expansions, and other web audits** are backlog items — implement later on the same ingest/runner substrate.

### D2 — Attribution depth: up to component-level CWV (Option C)

- Metrics are **not LCP-only** — LCP, CLS, INP, and related CWV (and future web vitals) are in scope over time.
- Presentation includes **higher-level rollups** (app / route / chunk) **and may drill to component level** when attribution data exists (lab run + source maps / framework hooks / marks).
- If attribution is incomplete, show coarser levels honestly (no fake component precision).

### D3 — Roadmap: full utilities epic before Map UI; Map after Gate A

- **M-041** is the **full stack-aware utilities epic**: foundation **plus** all domain packs (FE, BE, mobile, desktop, data/ML/AI, data eng, DevOps, embedded, game, QA/security) and monorepo support — see epic phases in the M-041 doc.
- Delivery is **phased** (one git branch per phase) so Hard Rules stay intact.
- **Map UI (M-017 / M-018) may start after Gate A** only: **P0 + P1 + Mono-v1** — not after every domain pack.
- Remaining phases (P2–P7, Mono-v2) continue under M-041 while Map proceeds.
- M-017 map data model accepts overlay payloads from this epic; M-018 renders them.

### D4 — Privacy: consent, local reports, no Prism Cloud

- **No Prism Cloud** for these utilities.
- Reports and artifacts stay **local** (workspace `.prism/` or explicit user path).
- Any **PageSpeed / remote perf API** (if ever offered) is **explicit consent only**, never Core default.
- Aligns with Q-009 / Q-010 (local-first; no GA telemetry).

### D5 — Multi-domain monorepo is first-class (Q-021)

- Detect and store **per-package** stack profiles (package/app roots), not only a single workspace winner.
- Expose a **workspace rollup**: union of domains/personas + `packages[]` with per-package signals.
- Utilities run against a **selected package** (or explicit multi-select / “all apps”); never silently assume the repo root is the only app.
- Conflicting stacks are **additive** at workspace level.
- **Mono-v1** (rollup + package selector) is part of Map Gate A; **Mono-v2** (cross-package impact, domain regions) may ship later in the epic.

## Consequences

- Positive: One epic owns all domain utilities; Map launches with real FE + monorepo context; BE/DevOps/… packs share ingest/job substrate.
- Negative: M-041 stays open longer as a phased epic; M-018 waits on Gate A (not the entire epic); Lighthouse runner adds optional toolchain complexity (isolate from Core default path).
- Follow-ups: Keep [`BACKLOG_STACK_UTILITIES.md`](../BACKLOG_STACK_UTILITIES.md) as the feature inventory; promote IDs into phase In Scope.

## Compliance

- [x] OPEN_QUESTIONS updated (Q-017–Q-021)
- [x] Backlog doc created / amended
- [x] Master Plan feature map + sequencing note
- [x] M-041 epic doc covers all domains + monorepo
