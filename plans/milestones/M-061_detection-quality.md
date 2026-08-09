# M-061 — Detection Quality

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-061-detection-quality` (from latest `main`) |
| Depends on | M-060 |
| Unlocks | M-062 |
| Packages | `@repo-prism/intelligence`, `@repo-prism/graph-engine`, `@repo-prism/core`, `@repo-prism/shared` |
| Amends | [ADR-0029](../adr/0029-signal-provenance.md) (inferred provenance on feature detection) |

## 1. Goal

Carry the M-051 deferral on detection quality. Stack detectors must not fire on devDependencies-only
or coincidental path names; feature inference must work when path conventions fail; backend extraction
must cover the frameworks teams actually use.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-E1** | Single-signal detectors — [`packs.ts`](../../packages/intelligence/src/stack/packs.ts). | Detectors emit weighted multi-signal hits — dependency in `dependencies` (+0.5), entry/config file (+0.3), path convention (+0.2); devDependencies-only caps confidence at 0.4 ("tooling only"); detection threshold 0.6. Negative fixtures that must not detect: react in devDeps, a docs folder named `k8s`, an unrelated `manage.py`, a sample `.ipynb` in a non-ML repo. |
| **P-E2** | Feature inference assumes one layout — [`infer.ts`](../../packages/intelligence/src/feature/infer.ts). | When path conventions yield zero features, fall back to label-propagation community detection over the import graph (graph-engine), confidence capped at 0.5 with `provenance: "inferred"` per ADR-0029; the modularity scorer stops penalising structure when features are inference-only; cross-feature edges gain alias/workspace imports after M-059. |
| **P-E3** | Backend extraction is narrow — [`backend/report.ts`](../../packages/intelligence/src/backend/report.ts). | Mount-point tracking (`app.use('/api', router)` resolved through import edges); tRPC router procedure extraction; GraphQL schema operations + resolver map keys; `.proto` service/RPC wired from the existing utility overlay into `BackendReport`. One fixture per framework. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Reference precision (barrels, tsconfig, homonyms) | M-059 Reference Precision |
| UI presentation of detection confidence | M-062 UI Actionability |
| Language expansion beyond TS/JS | Next planning cycle |
| Framework catalogue for every possible stack | Incremental — one fixture per framework in P-E3 |

## 4. Definition of Done

- [ ] M-060 Verified and merged; this branch cut from updated `main`
- [ ] Only one milestone `In Progress`
- [ ] P-E1 through P-E3 implemented
- [ ] Detector test suite includes all negative fixtures listed in P-E1
- [ ] Inferred features carry `provenance: "inferred"` per ADR-0029
- [ ] One golden fixture per backend framework in P-E3
- [ ] `bun run verify:milestone` green
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- Prism Completion Program (owner plan, 2026-08-08) — Phase 6
- [M-051 Hardening](./M-051_hardening.md) §5 — detection quality deferred here
- [M-059 Reference Precision](./M-059_reference-precision.md) — alias/workspace imports for P-E2
- [ADR-0029](../adr/0029-signal-provenance.md) signal provenance
