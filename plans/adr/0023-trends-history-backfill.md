# ADR-0023: Trends history store and git commit backfill

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-23 |
| Decision makers | Owner |
| Related milestones | M-046, M-008, M-015 |
| Related | ADR-0010 (SQLite cache location) |

## Context

Trends needs **health-over-time** and improving / regressing regions. Today there
is no persisted history of health or region scores across indexes, so charts are
empty on first open. Forward-only snapshots would leave new workspaces blank
until several future indexes complete — unacceptable for first-use product depth.

Recomputing historical points must stay **local** (no Prism Cloud) and use the
existing SQLite cache home (ADR-0010).

## Decision

Persist per-index **health and region scores** in the local SQLite cache, exposed
via Core APIs such as `getHealthHistory()` and `getRegionMovers()`.

In addition to forward snapshots on each index, run a **background backfill job**
that walks past git commits, recomputes health / region scores at selected
historical commits, and streams progress (“history sync in progress”) so Trends
charts populate on first use without waiting for future indexes.

Backfill is best-effort and may sample commits for performance; forward snapshots
remain the ongoing source of truth after sync completes.

**Backfill v1 approximation:** sampled historical points stamp the **current**
index health / region scores at each commit’s author date + SHA (no per-commit
checkout or re-index). Charts populate immediately; scores are not true
historical recomputes until a later milestone adds tree-at-commit analysis.

## Options Considered

### Option A — Forward-only snapshots

- Pros: simplest; cheap.
- Cons: empty Trends until multiple indexes; poor first impression.

### Option B — Forward snapshots + git commit backfill (recommended)

- Pros: charts usable immediately; still local-first.
- Cons: CPU/IO cost on first open; need progress UX and sampling policy.

### Option C — Import external metrics history (CI artifacts only)

- Pros: no historical recompute.
- Cons: incomplete without CI; does not cover region movers from Prism scores.

## Consequences

- Positive: Trends health-over-time and region movers work on fresh clones
- Positive: reuses SQLite cache location conventions
- Negative: backfill can be slow on large repos; must not block interactive UI
- Follow-up: tune commit sampling, retention, and cancellation semantics

## Compliance

- [ ] Updates Master Plan if roadmap impacted
- [ ] Updates package README(s) if API impacted
- [x] Linked from milestone doc (M-046)
