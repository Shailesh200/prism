# Signal provenance

**Every number Prism shows carries a record of where it came from. This is the
idea that makes the rest of the tool trustworthy, and it is why Prism sometimes
shows you nothing.**

## The problem it solves

A dashboard shows "Test coverage: 62%".

Was that measured by running the test suite? Estimated from the ratio of test
files to source files? Left over from a coverage report someone generated three
weeks ago? Or is it a default that appears when nothing is known?

You cannot tell. And because you cannot tell, you either trust all four equally
— and eventually get burned — or you trust none of them, and the dashboard is
decoration.

This is the failure mode of most code-analysis tools. A confident number with no
provenance is worse than no number, because it *feels* like information.

## What Prism does instead

Every signal carries its origin:

| Provenance | Meaning |
|---|---|
| **Measured** | Prism ran something, or read a real artefact. This is ground truth |
| **Derived** | Computed from the index by a deterministic rule. Correct if the index is |
| **Estimated** | Inferred from indirect evidence. Directionally useful, not exact |
| **Unavailable** | Prism does not know, and will not pretend to |

The surfaces show this. In the extension it is a marker next to the value; in
`--json` it is a field on the value; in the CLI, estimated figures are labelled
and unavailable ones are absent rather than zero.

## Unavailable is a real answer

This is the part that reads as a bug the first time you see it, so it is worth
being explicit.

If you have no git history, Prism does not show ownership. Not "unknown
author", not "0 contributors" — the ownership section is simply not there.

If no coverage report exists, Prism does not show a coverage figure. It does not
estimate one from test file counts and present it next to genuinely measured
numbers.

A zero and an absence mean completely different things. "No tests cover this
file" is an alarming fact. "Prism has no coverage data" is a configuration
problem. Rendering both as `0%` collapses them into one, and then the alarming
fact stops being alarming.

## Estimated is honest, not useless

Estimated values are shown, clearly marked. They are how Prism can be useful on
day one, before you have wired up coverage or given it any history.

Health history is the clearest example. When Prism first indexes a repository it
has one data point — today. It can *estimate* earlier points by replaying git
history, and it does, marked as estimated. As real snapshots accumulate, they
replace the estimates. The chart shows both, distinguished, so a trend built
from backfilled guesses never looks like a trend built from observation.

## What this costs

Sparser screens. A newly opened repository without git or coverage shows less
than a comparable tool would, because the comparable tool is filling the gaps
with plausible defaults.

That is the trade, made deliberately. A number you can act on is worth more than
five you have to double-check.

## Related

[Health score](./health-score.md) · [Risk bands](./risk-bands.md) · [Feature graph](./feature-graph.md)
