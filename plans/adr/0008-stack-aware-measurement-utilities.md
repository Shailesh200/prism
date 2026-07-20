# ADR-0008: Stack-aware measurement utilities (owner decisions 2026-07-20)

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-20 |
| Decision makers | Owner |
| Related milestones | M-040, M-013, M-014, **M-041+** (utilities epic), M-018 |
| Resolves | Q-017, Q-018, Q-019, Q-020 |
| Related backlog | [`BACKLOG_STACK_UTILITIES.md`](../BACKLOG_STACK_UTILITIES.md) |

## Context

Stack detection (M-040 / M-013) enables persona-aware product surfaces. Owner wants web perf (Lighthouse, CWV, SEO), deep attribution (including component-level CWV), and analogous utilities for mobile, desktop, DevOps, etc. — without a Prism Cloud.

## Decisions

### D1 — Web perf runner: opt-in local Lighthouse (Option B)

- Prism may **run Lighthouse (or equivalent) locally** when the user consents.
- UX **callout** before start must state prerequisites, e.g.:
  - app will be served / probed on a **dedicated local PORT**
  - diagnosis runs **asynchronously**
  - report is shown **when ready** (progress + completion)
- Core analysis paths stay free of surprise network I/O.
- **SEO scores, CWV pack expansions, and other web audits** are backlog items (see backlog doc) — implement later on the same ingest/runner substrate.

### D2 — Attribution depth: up to component-level CWV (Option C)

- Metrics are **not LCP-only** — LCP, CLS, INP, and related CWV (and future web vitals) are in scope over time.
- Presentation includes **higher-level rollups** (app / route / chunk) **and may drill to component level** when attribution data exists (lab run + source maps / framework hooks / marks).
- If attribution is incomplete, show coarser levels honestly (no fake component precision).

### D3 — Roadmap placement: utilities epic before Map UI (Option C)

- A **Stack-aware utilities / measurement epic** is scheduled **before M-018 (Map UI Playground)** so the first interactive UI can already surface stack-relevant diagnostics.
- Practical phasing inside the epic (not all backlog in one PR):
  1. Measurement + ingest contracts + Lighthouse opt-in runner UX  
  2. CWV/SEO report model + Core APIs  
  3. Domain pack scaffolds (mobile, BE, desktop, DevOps, …) with backlog features filled incrementally  
- M-017 map data model should accept overlay payloads from this epic; M-018 renders them.

### D4 — Privacy: consent, local reports, no Prism Cloud

- **No Prism Cloud** for these utilities.
- Reports and artifacts stay **local** (workspace `.prism/` or explicit user path).
- Any **PageSpeed / remote perf API** (if ever offered) is **explicit consent only**, never Core default.
- Aligns with Q-009 / Q-010 (local-first; no GA telemetry).

## Consequences

- Positive: Strong FE differentiation; consistent backlog pattern for every domain; Map UI launches richer.
- Negative: M-018 slips until M-041 epic foundation lands; Lighthouse runner adds optional browser/toolchain complexity (isolate from Core default path).
- Follow-ups: Milestone docs for M-041+; expand [`BACKLOG_STACK_UTILITIES.md`](../BACKLOG_STACK_UTILITIES.md) as domains grow.

## Compliance

- [x] OPEN_QUESTIONS updated  
- [x] Backlog doc created  
- [x] Master Plan feature map + sequencing note  
