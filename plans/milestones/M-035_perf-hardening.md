# M-035 — Performance Hardening

| Field | Value |
|---|---|
| Status | **Not Started** |
| Branch | `milestone/M-035-perf-hardening` (from latest `main`) |
| Depends on | M-051, M-052 |
| Unlocks | M-039 |
| Packages | `@prism/indexer`, `@prism/graph-engine`, `@prism/analyzer`, `@prism/repository-map`, `@prism/core` |

## 1. Goal

Make Prism's cost predictable on repositories larger than this one, and **prove** it with budgets
that fail the build when breached. Today there are no performance tests, no budgets and no fixture
at scale — so every performance claim in the plan is an assertion.

Measurement comes first. Optimising before there is a benchmark is how you get faster code that is
slower for users.

## 2. Known cost centres

Deferred here from the 2026-08-05 audit and from [M-051](./M-051_hardening.md) §5. Each is a
hypothesis until the benchmark confirms it.

| # | Cost centre | Location |
|---|---|---|
| 1 | Dependency graph rebuilt per call rather than memoised per index snapshot | `packages/core/src/workspace.ts` |
| 2 | Git signals collected synchronously, blocking the caller | `@prism/repository-map`, `@prism/core/git` |
| 3 | File inventory hashes sequentially — no parallelism across cores | `@prism/indexer` inventory |
| 4 | Full cache rewrite on every index rather than a delta write | `@prism/indexer` cache |
| 5 | AST walked three times per file for different extractions | `@prism/analyzer` |
| 6 | Map layout BFS is O(V²) on the node set | `@prism/repository-map` |
| 7 | Whole-index materialisation into memory for graph construction | `@prism/graph-engine` |

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

Work the list in benchmark order, highest cost first. Each optimisation lands as its own commit
with before/after numbers in the message. **An optimisation that does not move the benchmark gets
reverted**, however clever it is.

| Task | Detail |
|---|---|
| 3.1 | Memoise the dependency graph per index snapshot; invalidate on snapshot change |
| 3.2 | Make git signal collection async and cancellable; never block first paint on it |
| 3.3 | Parallelise inventory hashing across a worker pool sized to available cores |
| 3.4 | Delta cache writes keyed on content hash instead of full rewrite |
| 3.5 | Single-pass AST extraction |
| 3.6 | Replace the O(V²) layout BFS with an adjacency-indexed traversal |
| 3.7 | Stream or page index materialisation for graph construction |

### Phase 4 — Memory and concurrency safety

| Task | Detail |
|---|---|
| 4.1 | Peak RSS bounded at the 50k fixture; no unbounded per-file accumulation |
| 4.2 | Two concurrent workspaces on the same repository do not corrupt the SQLite cache |
| 4.3 | Cancellation: an in-flight index that is cancelled releases its handles and leaves the cache consistent |

## 4. Out of scope

- Rewriting the parser or swapping Oxc ([ADR-0009](../adr/0009-oxc-parser-v1-deep-ts-optional.md))
- Changing the cache engine ([ADR-0010](../adr/0010-sqlite-cache-location.md))
- Distributed or background indexing
- UI rendering performance — real, but a different milestone
- Any optimisation that changes output. Correctness is fixed; only cost moves

## 5. Definition of Done

- [ ] Only one milestone `In Progress`
- [ ] Fixture generator committed; three scales reproducible from a script
- [ ] Baseline published with machine and commit recorded
- [ ] `bun run bench` and `bun run bench:check` work and are documented
- [ ] Budgets enforced in CI as a separate job
- [ ] Every cost centre in §2 either optimised with a measured improvement, or documented as not worth it with the number that proves it
- [ ] Peak RSS bounded at 50k files
- [ ] No output change: all existing tests and goldens pass untouched
- [ ] `bun run verify:milestone --force` green
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 6. Verification plan

| Kind | Check |
|---|---|
| Benchmark | Cold index, warm index, incremental index at all three scales |
| Benchmark | Graph, map, blast, DNA, health at 10k |
| Budget | `bench:check` fails on a deliberately regressed build |
| Regression | Every existing unit, integration and golden test passes unchanged |
| Memory | Peak RSS recorded and bounded at 50k |
| Concurrency | Two workspaces, same repository, no cache corruption |
| Manual | Extension remains responsive while indexing the 50k fixture |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Optimisation changes output subtly | Goldens are the gate; any diff blocks the commit |
| Benchmarks are noisy and budgets flap | Report medians over repeated runs; set ceilings with headroom; CI job is advisory for one milestone before it blocks |
| Parallel hashing introduces nondeterminism | Results sorted before hashing; determinism test over repeated runs |
| Generated fixtures are unrepresentative | Generator mirrors this repository's shape — import depth, package count, file-size distribution |

## 8. References

- [M-051](./M-051_hardening.md) §5 · [ADR-0003](../adr/0003-locked-performance-stack.md) ·
  [ADR-0009](../adr/0009-oxc-parser-v1-deep-ts-optional.md) · [ADR-0010](../adr/0010-sqlite-cache-location.md)
