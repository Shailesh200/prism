# ADR-0013: Unified scalable map + local Git signals

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-22 |
| Decision makers | Owner, Architect |
| Related milestones | M-042 (expanded), M-022/M-023 (pulled forward) |
| Related | [ADR-0004](./0004-core-only-integration-surface.md), [ADR-0011](./0011-feature-inference-principles.md), [ADR-0012](./0012-health-score-weighting.md) |

## Context

The Repository Map shipped five zoom levels (`repo`, `package`, `feature`, `file`, `symbol`) as five parallel "show everything" views. Three of them (`repo`/`package`/`feature`) render through the same flat card grid, so they feel redundant, and the grid does not scale: a fixed 3-column, fixed-card layout turns a ~78-node repo into an unreadable 3x26 strip. `feature` is also a cross-cutting lens, not a structural altitude, yet it sits on the same rail as the containment hierarchy.

Separately, the map has no real engineering history: the `activity` and `ownership` layers are honest local heuristics (`stub: true`) with no commit/author/date/churn data anywhere in Core. Users expect GitLens-style "who changed what, when".

## Decision

1. **One structural map with semantic zoom.** Treat `repo -> package -> file -> symbol` as a single continuous drill-down (click to descend, breadcrumb to ascend) rather than five independent tabs. The zoom rail reflects position; it does not swap flat lists.
2. **Feature becomes a lens.** `feature` moves out of the structural rail into the layers/overlay group; when active it groups/colors the structural map by feature membership.
3. **Treemap for scale, cards for detail.** Overviews with many nodes render as a spatial treemap (area = node weight, color = active lens); focused / low-N scopes keep the bespoke Signal Chart cards. Node `attrs.weight` and a drill-scope pointer make area and drilling meaningful.
4. **Local Git signals in Core.** A new local, no-network Git reader (`git log --numstat`) produces per-file `lastCommit`, `contributors`, `churn` (commits/additions/deletions), recency and a weekly churn series. It fails soft: when the root is not a git repo or `git` is unavailable, the map builds exactly as before and git-backed layers stay stub/empty.
5. **Real Activity / Ownership.** When git signals exist, `activity` = recency heat and `ownership` = top-author band become real (`stub: false`); otherwise they retain the local heuristics.

## Options Considered

### Option A — Incrementally fix the card grid (wrap rows, responsive columns)

- Pros: Small change; keeps current renderer.
- Cons: Still card-per-node; breaks at thousands; does not resolve the redundant-levels problem.

### Option B — Unified semantic-zoom map (treemap + cards) + Feature-as-lens (chosen)

- Pros: Scales to large repos; removes redundancy; matches how spatial maps work; reuses the existing Highcharts treemap.
- Cons: Larger UI rework; introduces a drill/breadcrumb navigation model.

### Git placement — Option A: new `@repo-prism/git` package vs Option B: Core internal module (chosen)

- Chosen: keep the reader as a Core internal module (`packages/core/src/git/`) so IO stays in Core and `@repo-prism/repository-map` remains a pure builder that receives git data as input. Avoids new-package wiring and honors ADR-0004 (surfaces consume Core only).

## Consequences

- Positive: Large codebases become navigable; Activity/Ownership overlays and a per-node History panel gain real data; repository-map stays pure and deterministic (git parsing is a pure function over `git log` output; IO is isolated and mockable).
- Negative: M-042 expands well beyond "presentation polish" and now crosses package boundaries (shared types + Core IO + repository-map + UI). Git extraction adds a `git` subprocess dependency on the map path (guarded, optional, cached per build).
- Follow-ups: symbol/line-level blame, remote provider enrichment, and a full timeline explorer remain future work (M-023).

## Compliance

- [x] Updates Master Plan progress note (M-042 scope expanded; pulls M-022/M-023 git work forward)
- [x] Linked from milestone doc (M-042)
- [ ] Package READMEs updated if public Core API changes (git surfaces via map DTO attrs only)

## Notes

Privacy: git data is read from the local `.git` only; no network, consistent with the Core no-network analysis rule. The reader is bounded (commit/window caps) and degrades to a no-op on non-git roots.
