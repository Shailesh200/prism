# Fixtures

Prism's tests need repositories to analyse. There are four kinds, and picking
the wrong one is the usual reason a test is slow, flaky, or proves less than it
appears to.

## 1. Analyzer golden fixtures — `packages/analyzer/fixtures/`

Small hand-written source files with a recorded expected parse. They exist to
catch changes in what the parser extracts: a symbol that stops being found, an
import that starts resolving differently.

- `sample.ts`, `sample.tsx` — single files covering common syntax.
- `multi/` — several files that import each other, so edge resolution is
  covered rather than just extraction.

Change one of these only when the parser's output is *meant* to change, and
update the recorded expectation in the same commit. A golden file that gets
regenerated to match whatever the code now does has stopped being a test.

## 2. Built repositories — `@repo-prism/test-support`

Real git repositories created in a temp directory at test time, used by the
integration layer. Prefer these over hand-built index snapshots: a snapshot you
construct yourself tests your idea of what indexing produces, not what it
produces.

```ts
import { typicalRepository } from "@repo-prism/test-support";

const fixture = await typicalRepository();
// fixture.root is an absolute path to a real repo with real git history
await fixture.cleanup();
```

| Shape | What it is | Use it for |
|---|---|---|
| `typicalRepository()` | ~11 files, a few packages, imports that form a cycle, real commits by two authors | The default. Anything that needs plausible analysis output. |
| `repositoryWithoutGit()` | The same files, no `.git` | Proving git-dependent features degrade rather than crash. |
| `emptyRepository()` | An initialised repo with no source files | Empty states — the screen a user sees on day one. |

Call `cleanup()` in `afterAll`. The fixtures live under the OS temp directory,
so a leak is not destructive, but it is untidy and slows later runs.

To add a shape, put it in `packages/test-support/src/repositories.ts` rather
than building files inline in a test. Shapes that live in one test file get
copied into the next one and then drift.

## 3. Generated scale fixtures — `scripts/bench/generate-fixture.mjs`

Synthetic repositories at 1k / 10k / 50k files, used by the benchmark harness
and nothing else. Their file contents are meaningless; only the shape matters
— package count, import fan-out, and a deliberate share of cycles, all chosen
to mirror the statistics of a real repository.

```bash
bun run scripts/bench/generate-fixture.mjs --scale medium
bun run bench            # generate + measure
bun run bench:check      # measure and compare against budgets.json
```

These are not committed. They take a while to generate and tens of megabytes to
store, and regenerating them is deterministic.

Do not assert on analysis *results* from these. The content is generated, so
"the health score is 62" pins the generator, not the analysis.

## 4. This repository

`prism` run against its own checkout is the broadest test available, and it is
what the smoke script uses. It is not automated beyond that, because asserting
on real output means editing tests whenever the code changes.

## Choosing

- Testing what the parser extracts → analyzer golden fixture.
- Testing a Core method, a CLI command, an MCP tool, or the extension host →
  `typicalRepository()`.
- Testing that something is fast → generated scale fixture.
- Testing that something is *right* on real code → run it here by hand.
