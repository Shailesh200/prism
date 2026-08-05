# Morning report — 2026-08-05

Everything in the plan is built and verified. Two things are waiting for you,
both deliberately: **the commit and the release tag**. `AGENTS.md` says no
commits without your approval, so 106 changed files are sitting in the working
tree, verified but uncommitted.

## Where it stands

| | |
|---|---|
| Milestones | M-026 … M-039 complete. M-039 is **In Review** |
| Version | 1.0.0 across the extension, Core, CLI and MCP server |
| `bun run verify:milestone` | green — 1147 tests across 25 packages |
| `bun run test:e2e` | green — 12 Playwright specs |
| `bun run bench:check` | green at 1k and 50k files — every budget at 15–52% of its limit |
| `bun run docs:build` | green |
| VSIX | `packages/vscode-extension/repo-prism-1.0.0.vsix` (107 files, 5.13 MB) |

## What last night actually changed

The plan for M-039 was mostly an audit, and the audit was the valuable part. I
cloned a repository Prism had never seen (`sindresorhus/p-queue`) and used every
surface against it the way a new user would. That found four defects that no
unit test had reason to catch, because each one only appears when the repository
is not this one.

**`prism doctor` reported Core `0.1.0`.** The version was a hand-maintained
constant next to `package.json`, and it had drifted. This is the first command
anyone runs, reporting the wrong version of a tool whose whole claim is
accuracy. Fixed, and pinned — a test now asserts the constant equals the
manifest, so it cannot drift again.

**The map drew a blank canvas.** On a small, flat repository the default feature
zoom infers no features, so it rendered zero nodes and said nothing. A blank
screen is indistinguishable from a crash. Every zoom level now explains its own
emptiness in terms of what that zoom measures — "Prism groups files into
features from directory structure and import clustering; a small or flat
repository often has nothing to group — that is a fact about the layout, not a
failure" — and offers a button to the zoom that does have content. I verified it
in the browser at 620, 900, 1280 and 2074 px: centred, inside the stage, no
overflow, colours resolved from the design tokens (6.1:1 contrast on the body
text, above AA).

**`prism map --zoom repository` returned `PRISM_UNKNOWN`.** The value was cast
straight through to Core, which threw. An internal-fault code for what is
plainly a typo, with no hint at the five valid values. It is now a validation
error that names them, and `--help` lists them too.

**Usage errors exited 1.** Commander's own errors — missing argument, too many
arguments — bypassed the exit-code contract, because subcommands are created
before `exitOverride` is applied. Exit 1 is reserved for "the analysis found
what you asked about", so in CI a mistyped command line was indistinguishable
from a real finding. All usage errors now exit 2, pinned by ten new integration
tests.

Alongside those: the zoom list existed in three places and is now defined once
in `@repo-prism/shared`; all 28 MCP tools were probed over stdio and every one
returned data with stdout staying pure JSON-RPC; every ADR is now Accepted; and
all 23 open questions carry an explicit disposition.

The README was also badly stale — it described the repo as being at M-001 with
"stubs" and "target deliverables", and said publishing happens on `main` when it
has been tag-triggered since M-051. Rewritten. The progress board also carried
two rows for M-026, one stale at "Not Started" and one accurate at "In Review";
the stale one is gone and the consistency check reads 54 milestones, DoD clean.

The 50k-file benchmark finished after the report was first written and confirms
the largest column in `08_PERFORMANCE.md` rather than leaving it resting on a
single earlier run: 96.4 s cold index, 25.0 s warm, 17.6 s to reindex one
changed file, 4.2 s repository map, 1.65 GB peak against a 4 GB ceiling. Every
measurement sits at 30–51% of budget.

New documents: [`CHANGELOG.md`](../CHANGELOG.md) written for users rather than
as a commit log, and [`plans/RELEASE_RUNBOOK.md`](./RELEASE_RUNBOOK.md) covering
what you run, what it sets off, and how to recover — including the case where
publishing has already happened and the version is spent.

## Gaps — things I could not close

**The commit and the tag.** `AGENTS.md` forbids committing without your
approval, and a tag needs a commit, so M-039's "tag created locally" is blocked
on you. Everything else in the milestone is done.

**The branch is wrong.** The work is sitting on `milestone/M-037-e2e-suite`
rather than `milestone/M-039-ga-readiness`, and it spans both milestones. Moving
it would have meant committing. Worth deciding whether to split the commit by
milestone or take it as one.

**Windows is unverified.** M-039 asked for green on three platforms. I ran macOS
only; Windows runs in CI as advisory (`continue-on-error`). This is a known,
documented limit rather than a surprise, but it is not what the milestone asked
for.

**The VSIX was packaged but not installed.** Neither `code` nor `cursor` is on
the PATH here, so I could not sideload and click through the real extension. The
playground exercises the same `app-shell` and `ui` packages and is green, and
the extension's own tests pass, but the packaged artifact has not been run in an
editor. That is the first thing worth doing in your smoke test.

**Fresh-clone install was verified on macOS only**, not Linux, and I did not
follow the quickstart literally on a clean machine.

**Marketplace release notes** were not written separately; `CHANGELOG.md` is the
source. **npm packaging** is still deferred behind Q-003, as planned.

**One inconsistency I chose not to fix.** MCP impact tools take
`{ kind, id }` while the graph tools take `{ kind, path }`. Both validate
cleanly and give good errors, but they disagree. 1.0.0 is the honest moment to
unify them, and it is also a breaking change to the agent-facing API touching
many tools and tests. I did not want to rewrite that surface overnight without
you. Your call.

## Suggested order this morning

1. Sideload `repo-prism-1.0.0.vsix` and click through a repository you know.
2. Try the map on something small and flat, to see the empty state in place.
3. If it holds up: approve the commit, then follow
   [`plans/RELEASE_RUNBOOK.md`](./RELEASE_RUNBOOK.md).
