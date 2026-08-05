# Impact analysis

**Four questions about a change you have not made yet.**

| Question | Command |
|---|---|
| What does changing this affect? | `prism blast <path>` |
| Can I delete this? | `prism safe-delete <path>` |
| What does renaming this touch? | `prism rename <target> [newName]` |
| Which tests should I run? | `prism test-impact <target>` |

And one about a change you have already started:

| | |
|---|---|
| How risky is what I am about to commit? | `prism review` |

## Blast radius

The reach of a change: direct dependents, transitive dependents, affected tests,
affected features, and a banded risk score.

```bash
prism blast src/features/cart.ts
prism blast src/features/cart.ts --delete
```

Explained in full under [blast radius](../concepts/blast-radius.md).

## Safe delete

Blast radius asks what changes. Safe delete asks what *breaks*, and adds the
question blast radius does not:

| | |
|---|---|
| **Blockers** | Things that would fail to resolve if this went away |
| **Orphans** | Files left dead because only this reached them |

Orphans are the useful half. Deleting one file often makes three others dead
code, and nothing else will tell you that — which is how repositories accumulate
modules nothing imports.

```bash
prism safe-delete src/legacy/adapter.ts
```

It reports. It never deletes anything.

## Rename impact

Every site that would need editing, plus hints about what might break beyond
your repository:

```bash
prism rename src/util.ts src/helpers.ts
prism rename useCart --symbol --in src/features/cart.ts
```

The breaking-change hints matter for anything exported from a package. Renaming
an internal helper is a refactor; renaming an exported one is an API change, and
the hint says which you are doing.

Like safe delete, this reports rather than acts.

## Test impact

Which tests actually cover the code you touched:

```bash
prism test-impact src/features/cart.ts
prism test-impact useCart --symbol
```

Useful in CI on a large suite: run the tests that could plausibly fail rather
than all of them. Prism errs towards including a test — a missed test is worse
than an extra one.

## Change review

The aggregate version, for everything in your working tree:

```bash
prism review
prism review --base origin/main --fail-on high
```

With no arguments it reviews the working tree, including untracked files — a new
file nothing imports yet is exactly the change a review should notice. In CI,
pass `--base` to compare against the branch you are merging into.

This is the single most useful command to put in a pipeline. It answers the
reviewer's first question — "how big is this really" — before a human spends
attention on it.

## In the extension

The Impact screen carries all of the above, plus the change review panel, which
updates as you edit.

## Related

[Blast radius](../concepts/blast-radius.md) · [Dependency graph](../concepts/dependency-graph.md) · [CLI reference](../reference/cli-commands.md)
