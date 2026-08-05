# 08 — Performance

> Status: current as of M-035 (2026-08-05).
> Companion to [06_TECH_STACK.md](./06_TECH_STACK.md) and [ADR-0026](../adr/0026-incremental-watch-invalidation.md).

Prism runs on a developer's laptop, next to the compiler and the language server
they are already paying for. That framing decides what "fast enough" means here:
the number that matters is not throughput, it is how long somebody sits looking
at a spinner after touching one file.

## How this is measured

Two scripts, both outside `verify:milestone` because they take minutes and a
verification suite people skip verifies nothing.

```bash
bun run bench                      # medium scale (10k files), 3 reps
bun run bench -- --scale large     # ~50k files
bun run bench:check                # small scale, compared against budgets
bun run bench:check -- --scale medium
```

`scripts/bench/generate-fixture.mjs` writes a synthetic TypeScript repository
whose shape is taken from this one: same median file length, same imports per
file, same ratio of cross-package to within-package edges, and a handful of
deliberate cycles. Synthetic rather than a vendored real repository because the
scaling behaviour is what is under test, and a fixture that can be regenerated
at three sizes shows scaling in a way a single snapshot cannot.

Reported figures are **medians** of the repetitions. One unlucky run where the
OS decided to reindex Spotlight should not become the number a budget is set
from.

## Baseline

Apple Silicon laptop, Node 26.5.0, 2026-08-05. Absolute numbers are
machine-dependent; the shape across the three columns is not.

| Operation | 1k files | 10k files | 50k files |
|---|---:|---:|---:|
| index (cold) | 1.8 s | 18.5 s | 96.4 s |
| index (warm, all cached) | 0.3 s | 2.7 s | 25.0 s |
| reindex (one file changed) | 0.2 s | 1.9 s | 17.6 s |
| dependency graph | 0 ms | 0 ms | 0 ms |
| cycles | 0 ms | 0 ms | 0 ms |
| repository map | 423 ms | 1.0 s | 4.2 s |
| blast radius | 24 ms | 482 ms | 5.3 s |
| DNA | 77 ms | 344 ms | 0.9 s |
| health | 31 ms | 537 ms | 5.2 s |
| peak RSS | 482 MB | 1.2 GB | 1.7 GB |
| index on disk | 7 MB | 75 MB | 371 MB |

The graph rows read zero because indexing already built the graph and these
calls hit the memo. That is the honest number for what a user waits for, but it
makes those two rows useless as a measure of graph *construction* — so their
budgets are set far below the build cost instead, where a broken memo will trip
them.

## What was fixed to get here

Five changes, all of them shape rather than constant factors, all found by CPU
profile rather than by reading the code and guessing. Worth saying plainly: of
the seven cost centres this milestone started with as hypotheses, three were
wrong about where the time actually went, and two of the largest real costs were
not on the list at all.

### Dependency graph rebuilt on every call

Almost every report starts by building the dependency graph, and several built
it more than once — the engineering report alone called it three times. Each
call re-resolved every import in the repository.

It is now memoised per index snapshot, keyed on the snapshot *object* rather
than on its `indexedAt` timestamp: the timestamp has millisecond resolution, so
two reindexes inside the same millisecond would share a key and one of them
would read a stale graph. Snapshots are replaced wholesale and never mutated, so
object identity answers exactly the right question. `DependencyGraphResult` was
tightened to be readonly all the way down, so the compiler now enforces the
assumption that makes sharing safe.

### Repository map: two quadratic scans

`buildFeatureZoom` compared every pair of features by comparing every pair of
their member files, splitting each path on `/` inside the inner loop. Comparing
precomputed prefix *sets* instead answers the same question — do these two
features share a two-segment directory prefix — proportional to the number of
distinct directories rather than the number of files.

`computeLayerSignals` answered "does a test exist for this file" by materialising
the whole test-path set into an array and scanning it, once per node. Building
the index in the other direction — from each test path, the bases it could
cover — turns that into one set lookup per node. The same pathology sat in the
directory rollup, which rebuilt and scanned the full path list for every package
node; that one is now a binary search into a sorted list.

Together: 31.7 s → 1.0 s at 10k files, 66.9 s → 4.2 s at 50k. More importantly
the operation now scales roughly linearly, where before 5x the files cost 18x
the time.

### Cache: a full rewrite on every index

`saveSnapshot` deleted every row for the workspace and reinserted the entire
snapshot, re-serialising every payload. That cost the same whether one file
changed or all of them had. It now writes only rows whose identity columns
differ, which is sound for the same reason the reuse path is sound: a file's
payload is derived from its content.

### Cache: a full integrity check on every open

`openIndexCache` ran `PRAGMA integrity_check`, which verifies every index
against its table — a full scan, measured at 723 ms on a 75 MB cache, on every
open, and Core opens the cache more than once per index. `quick_check` still
catches the damage that actually happens (truncated writes, a half-flushed WAL,
a file that is not a database) without the index cross-check.

Between them, reindexing one file in a 10k-file repository went from 4.2 s to
1.9 s.

## What was measured and deliberately left alone

Three of the original hypotheses did not survive contact with a profile. Writing
them down matters as much as the fixes: each would have been real work, and none
of it would have made Prism faster.

**Git signals collected synchronously.** Expected to be the reason the map was
slow. Git never appeared above the noise floor in any profile; the map's cost was
two quadratic scans sitting next to it. Making signal collection async and
cancellable is a meaningful concurrency risk to take on this evidence.

**Sequential inventory hashing.** Roughly half a second of a ninety-six second
cold index at 50k files. Cold indexing is dominated by oxc parsing, which is
already concurrent.

**AST walked three times per file.** Real, and inside the same cold-index cost
that oxc dominates. A single-pass rewrite is analyzer surgery for a return the
benchmark cannot currently see.

## Known costs that remain

Recorded rather than fixed, because each is a trade against something else and
none of them is the thing a user waits on most.

**Reading the cache re-validates every row.** About half of the remaining
incremental reindex time is `JSON.parse` plus a Zod parse of every cached file.
The validation is a real trust boundary — the cache is on-disk data that a
different Prism version or a stray editor could have touched — so removing it is
a decision about what Prism trusts, not a micro-optimisation. Worth revisiting
with a hand-written validator if incremental reindex becomes the complaint.

**Cold index is dominated by parsing, not by Prism.** 96 seconds for 50k files
is roughly the cost of running oxc over 50k files; the harness around it is
noise. It is a one-time cost per repository and it is cached afterwards.

**`blast_radius` and `health` are superlinear at 50k.** Around 5 s there against
0.5 s at 10k — a ten-fold rise for five times the files. Neither has been
profiled. 50k files in one repository is well past what Prism is aimed at, so
this is noted rather than treated as a defect.

**Memory grows with repository size.** The whole index snapshot is held in
memory. 1.7 GB at 50k files is survivable on a modern laptop but is not a
strategy that extends much further; a streaming or paged index would be the next
structural change if it needed to.

## Budgets

`scripts/bench/budgets.json` holds a ceiling for each operation at each scale,
set at roughly 2x the baseline above. Wide enough that a slower laptop or a busy
CI runner does not fail; tight enough that an algorithmic regression does. A
budget failure means "something changed shape, go look" — not "this machine is
slow".

Raising a budget requires a note here saying why the work got more expensive.
Silently widening the ceiling turns the file into decoration.
