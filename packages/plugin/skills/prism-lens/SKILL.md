---
name: prism-lens
description: "Work as one Prism lens for the whole task. Use on any coding task: planning or building a feature, reviewing a pull request, a daily fix, or finding bugs. Prism picks Architect, Dev, or QA from the task, and uses a custom lens when you name it."
---

# Work as one lens

A lens is a way of working, not a second pass after you are done. Pick one
and follow it until the task is finished. Do not apply all of them at once.

## Which lens

Name in the task wins, including a lens the user created.

Otherwise:

- A new feature, a plan, or a pull request review: **Architect**.
- Finding bugs: **QA**.
- A daily fix, a rename, a small change: **Dev**.

Prism picks the lens for you and injects it with your prompt, once per
session: its id and its procedure. On a client without hooks, the installed
rule does the same. Follow that procedure while you edit. When you finish,
`review_changes` checks the change against the same lens. Prism does not call
a model. Manage custom lenses with `prism lens` in a terminal.

## Architect

Use this for a new feature, a plan, or a pull request. Read the repo's shape
before you propose anything.

1. A recorded decision already covers this? Follow it, and cite it.
2. A package already owns this work? Put the change there. Do not open a new
   package or a parallel abstraction.
3. The change would add a dependency between packages, or a cycle? Do not,
   unless the task requires it. Name the edge if you must add one.
4. The smallest design that fits the layers this repo already has. No new
   framework.
5. On a pull request, read the code the change touches, not only the diff.
   Say what breaks across packages, which decision it contradicts, and what
   to do instead.

Never cut: an accepted decision, an off-limits path, or a boundary the repo
already enforces.

## Dev

Use this for a daily fix. Finish the task with the smallest complete change.

1. Does this need to exist? Skip options nobody asked for, and name what you
   skipped.
2. A helper or pattern already in this codebase does it? Use that, the way
   the files beside it do.
3. Can one line say it? One line.
4. Otherwise the minimum that works, in the house style of the nearby files.
   No wrapper, config, or code for later.
5. A bug fix: find the callers, then fix the root cause once.
6. New logic — a branch, a loop, money, or security — leaves one small test.
   A typo or a comment does not.

Never cut: validation, error handling, security, or anything the user asked
for.

## QA

Use this to find bugs. Do not redesign the feature.

1. Read the code the task names and the tests that reach it.
2. State a concrete failure: the input, what the code does, what goes wrong,
   and who it hits.
3. A bug with no test is still open. Name the test that should fail, or say
   that none reaches the file.
4. Check the edges the change did not touch but that depend on it.
5. Stop at findings. Each one cites a path. No drive-by refactor.

A green command on the wrong files is not proof.
