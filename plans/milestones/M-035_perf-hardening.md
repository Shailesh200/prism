# M-035 — Performance Hardening

| Field | Value |
|---|---|
| Status | **In Review** |
| Branch | `milestone/M-035-perf-hardening` (from latest `main`) |
| Depends on | M-051, M-052 |
| Unlocks | M-039 |
| Packages | `@repo-prism/indexer`, `@repo-prism/graph-engine`, `@repo-prism/analyzer`, `@repo-prism/repository-map`, `@repo-prism/core` |

## 1. Goal

Make Prism's cost predictable on repositories larger than this one, and **prove** it with budgets
that fail the build when breached. Today there are no performance tests, no budgets and no fixture
at scale — so every performance claim in the plan is an assertion.

Measurement comes first. Optimising before there is a benchmark is how you get faster code that is
slower for users.

## 2. Known cost centres

Deferred here from the 2026-08-05 audit and from [M-051](./M-051_hardening.md) §5. Each was a
hypothesis until the benchmark confirmed or refuted it — and the benchmark refuted several of them,
which is the point of measuring first.

| # | Cost centre | Verdict |
|---|---|---|
| 1 | Dependency graph rebuilt per call rather than memoised | **Confirmed, fixed.** Worse than described: the engineering report alone built it three times. Memoised per snapshot object in `@repo-prism/intelligence`, so every caller benefits. 236 ms → 0 at 10k |
| 2 | Git signals collected synchronously, blocking the caller | **Refuted as a top cost.** Git did not appear in any profile above the noise floor; the map's cost was two quadratic scans, not git. Not worth the concurrency risk on this evidence |
| 3 | File inventory hashes sequentially | **Refuted as a top cost.** Hashing is ~0.5 s of a 90 s cold index at 50k. Cold index is dominated by parsing, which is already concurrent |
| 4 | Full cache rewrite on every index rather than a delta write | **Confirmed, fixed.** The single largest item in an incremental reindex — ~1 s at 10k. Now writes only rows whose identity columns differ |
| 5 | AST walked three times per file for different extractions | **Not addressed.** Real, but inside the cold-index cost that is already dominated by oxc itself; a single-pass rewrite is analyzer surgery with a poor measured return. Recorded in the performance doc |
| 6 | Map layout BFS is O(V²) on the node set | **Confirmed in a different place.** The quadratics were in `buildFeatureZoom` (feature × feature × member × member) and in the layer-signal coverage and directory scans, not in layout. All three fixed: 31.7 s → 1.0 s at 10k, 66.9 s → 5.8 s at 50k |
| 7 | Whole-index materialisation into memory | **Confirmed, not fixed.** 1.9 GB peak at 50k. Survivable, and bounding it means a paged index — a structural change well beyond this milestone. Recorded with the number that justifies deferring it |

Two costs the benchmark found that were **not** on this list: `PRAGMA integrity_check` on every
cache open (723 ms on a 75 MB cache, and Core opens the cache more than once per index), and Zod
re-validation of every cached row on read (about half of what remains of an incremental reindex).
The first is fixed; the second is recorded as a deliberate trust decision.

## 3. Scope — phases

### Phase 1 — Measurement infrastructure

| Task | Detail |
|---|---|
| 1.1 | Generated fixture repositories at three scales — roughly 1k, 10k and 50k files — produced by a committed script rather than committed wholesale |
| 1.2 | Benchmark harness recording wall time, peak RSS and index size for: cold index, warm index, incremental index of one file, dependency graph, repository map, blast radius, DNA, health |
| 1.3 | Baseline committed as `plans/notes/M-035-baseline.md` — numbers, machine, and the commit they came from |
| 1.4 | `bun run bench` task; **not** part of `verify:milestone` (too slow), but runnable and documented |

### Phase 2 — Budgets

| Task | Detail |
|---|---|
| 2.1 | Budget file with a ceiling per operation per scale, set from the baseline plus headroom |
| 2.2 | `bun run bench:check` fails when a budget is breached |
| 2.3 | Wire into CI as a separate job so a regression is visible without slowing `verify:milestone` |
| 2.4 | Document how to update a budget deliberately — a raised ceiling needs a reason in the commit message |

### Phase 3 — Optimise, in measured order

Worked in benchmark order, highest cost first. **An optimisation that does not move the benchmark
gets reverted**, however clever it is — and equally, a cost centre the benchmark does not confirm
does not get optimised. Three of the seven guesses in §2 were wrong about where the time went.

| Task | Detail |
|---|---|
| 3.1 | Memoise the dependency graph per index snapshot, keyed on snapshot object identity |
| 3.2 | Two quadratic scans out of the repository map: feature-zoom pairing, and layer-signal coverage / directory rollup |
| 3.3 | Delta cache writes: touch only rows whose identity columns changed |
| 3.4 | `quick_check` instead of `integrity_check` on cache open |
| 3.5 | Cost centres 2, 3, 5 and 7 measured and left alone, each with the number that justifies it |

### Phase 4 — Memory and concurrency safety

| Task | Detail |
|---|---|
| 4.1 | Peak RSS recorded at the 50k fixture and held under budget; growth is proportional to repository size, not unbounded per-file accumulation |
| 4.2 | Two concurrent workspaces on the same repository do not corrupt the SQLite cache |
| 4.3 | A corrupt cache is detected and rebuilt rather than surfaced as query failures — including damage inside an otherwise-valid file, which the header check cannot see |

## 4. Out of scope

- Rewriting the parser or swapping Oxc ([ADR-0009](../adr/0009-oxc-parser-v1-deep-ts-optional.md))
- Changing the cache engine ([ADR-0010](../adr/0010-sqlite-cache-location.md))
- Distributed or background indexing
- UI rendering performance — real, but a different milestone
- Any optimisation that changes output. Correctness is fixed; only cost moves

## 5. Definition of Done

- [x] Only one milestone `In Progress`
- [x] Fixture generator committed; three scales reproducible from a script — `scripts/bench/generate-fixture.mjs`
- [x] Baseline published with machine and commit recorded — [`plans/architecture/08_PERFORMANCE.md`](../architecture/08_PERFORMANCE.md)
- [x] `bun run bench` and `bun run bench:check` work and are documented
- [x] Budgets enforced in CI as a separate job — `.github/workflows/bench.yml`
- [x] Every cost centre in §2 either optimised with a measured improvement, or documented as not worth it with the number that proves it
- [x] Peak RSS recorded and bounded at 50k files
- [x] No output change: all existing tests and goldens pass untouched
- [x] `bun run verify:milestone` green
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 6. Verification plan

| Kind | Check | Result |
|---|---|---|
| Benchmark | Cold, warm and incremental index at all three scales | Done — table in the performance doc |
| Benchmark | Graph, map, blast, DNA, health at 10k | Done |
| Budget | `bench:check` fails on a deliberately regressed build | Done — verified against a doctored result file; exits 1 naming the operations over budget |
| Regression | Every existing unit, integration and golden test passes unchanged | Done — no golden or expectation was edited to accommodate an optimisation |
| Equivalence | Rewritten lookups pinned against the scans they replaced | Done — `layer-signals.test.ts` brute-forces both answers on deliberately awkward paths (shared prefixes, dots in directory names, nested tests) |
| Correctness | Differential cache write does not leave stale or orphaned rows | Done — `store.test.ts`, including a count of how many rows a no-op save touches |
| Correctness | Memoised graph is never stale | Done — `build.test.ts` pins that a new snapshot object rebuilds even when it is otherwise identical |
| Corruption | Damage inside an otherwise-valid database file is still caught after the move to `quick_check` | Done — `cache.integration.test.ts` overwrites content pages, keeping the header intact |
| Memory | Peak RSS recorded and bounded at 50k | Done — 1.9 GB, under budget |
| Concurrency | Two workspaces, same repository, no cache corruption | Done — `concurrency.integration.test.ts`: four simultaneous indexes agree on the file set, cache passes `quick_check`, next index is still a hit |
| Manual | Extension remains responsive while indexing the 50k fixture | **Not done** — needs a human at the keyboard; carried into the smoke pass |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Optimisation changes output subtly | Goldens are the gate; any diff blocks the commit |
| Benchmarks are noisy and budgets flap | Report medians over repeated runs; set ceilings with headroom; CI job is advisory for one milestone before it blocks |
| Parallel hashing introduces nondeterminism | Results sorted before hashing; determinism test over repeated runs |
| Generated fixtures are unrepresentative | Generator mirrors this repository's shape — import depth, package count, file-size distribution |

## 8. Outcome

| Operation | 10k before | 10k after | 50k before | 50k after |
|---|---:|---:|---:|---:|
| repository map | 31.7 s | 1.0 s | 66.9 s | 5.8 s |
| reindex one file | 4.2 s | 1.9 s | — | 15.4 s |
| dependency graph | 244 ms | 0 ms | 1.7 s | 0 ms |
| health | 770 ms | 537 ms | 6.9 s | — |
| blast radius | 623 ms | 482 ms | 7.5 s | — |

The repository map is the headline: it was not merely slow, it scaled quadratically, so five times
the files cost eighteen times the time. It now scales linearly, which matters more than the ratio.

Full baseline, the reasoning behind each change, and the costs deliberately left in place:
[`plans/architecture/08_PERFORMANCE.md`](../architecture/08_PERFORMANCE.md).

## 9. References

- [M-051](./M-051_hardening.md) §5 · [ADR-0003](../adr/0003-locked-performance-stack.md) ·
  [ADR-0009](../adr/0009-oxc-parser-v1-deep-ts-optional.md) · [ADR-0010](../adr/0010-sqlite-cache-location.md)
