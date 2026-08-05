# The health score

**A single 0–100 number for a repository, plus the five factors that produced
it. The factors are the useful part.**

Higher is better. A health score of 85 is good; a blast radius of 85 is not.
Prism scores health as quality and risk as risk, and colours both so that green
always means the good end.

## The five factors

| Factor | Weight | What it measures |
|---|---|---|
| **Parse health** | 25% | What proportion of files Prism could actually read |
| **Test presence** | 25% | Whether tests exist and, where measured, cover the code |
| **Coupling** | 25% | How tangled the dependency graph is |
| **Modularity** | 15% | Whether the code has recognisable boundaries |
| **Diagnostics** | 10% | Parse errors, unresolved imports, and similar signals |

The weights sum to 1 and are fixed. They are a judgement, not a discovery, and
they are written down so you can disagree with them precisely.

### Parse health

The proportion of files Prism parsed successfully. This is first among equals:
if Prism could not read a third of your repository, every other number is
computed from an incomplete picture, and you should fix that before reading the
rest.

A low parse health score usually means an unusual build setup or a misconfigured
exclude — rarely a broken repository.

### Test presence

Whether tests exist, and where a coverage report is available, what it says.

Prism prefers a measured coverage figure. If there is none, it falls back to
structural evidence — the ratio of test files to source files — and marks the
factor as estimated rather than measured. See
[signal provenance](./signal-provenance.md).

### Coupling

How much of the dependency graph is entangled. High coupling means changing one
thing tends to require changing others, which is what makes a codebase feel
heavy to work in.

### Modularity

Whether the code separates into clusters with more internal than external
dependencies — that is, whether the boundaries the folder structure claims exist
actually exist in the imports.

### Diagnostics

The smaller signals: parse warnings, unresolved imports, files that look
orphaned. Weighted least because individually each is often benign.

## Grades

The score also maps to a letter, on the familiar scale: A at 90 and above, B at
80, C at 70, D at 60, F below that.

The grade is for glancing at. The score is for comparing over time. The factors
are for acting on.

## What it is not

**It is not a code quality score.** Prism does not read your logic, judge your
abstractions, or know whether your architecture suits your problem. It measures
structural properties it can observe.

**It is not comparable between repositories.** A 72 in a mature monorepo and a
72 in a three-month-old service mean different things. Compare a repository to
its own past, not to someone else's present.

**It is not a target.** A score optimised directly stops measuring anything —
you can raise test presence by adding empty test files. The score is a
thermometer, not a goal.

## Over time

Prism records a health point as it indexes, keyed by commit, and keeps them in
the index cache alongside everything else it derives. The extension charts them
on the Trends screen; the `health_history` MCP tool returns them.

On a repository Prism has only just seen, it can backfill earlier points by
replaying git history. Those points are marked estimated and are visually
distinct from measured ones, so a trend line built from reconstruction never
looks like one built from observation.

## Related

[Signal provenance](./signal-provenance.md) · [Risk bands](./risk-bands.md) · [Engineering health](../features/health.md)
