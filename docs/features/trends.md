# Trends

**Health over time, and which parts of the repository moved.**

A health score on its own tells you where you are. The trend tells you which
direction you are going, which is the more useful of the two — a 68 that was 61
last month is a very different situation from a 68 that was 79.

## What is recorded

Prism records a health point as it indexes, keyed by commit: the overall score
and each of its factors. Points accumulate in the index cache and the extension
charts them on the Trends screen.

Because points are keyed by commit rather than by wall-clock time, the history
tracks the repository rather than your working habits. A week you did not open
the editor does not appear as a week of flat health.

## Backfill

On a repository Prism has only just met, the chart would otherwise start today.
So Prism can reconstruct earlier points by replaying git history and scoring
what it finds.

**Backfilled points are marked estimated**, and are visually distinct from
measured ones. A reconstruction is not a measurement: it scores what the files
looked like, without the tooling context of the time. The shape of the line is
trustworthy; individual values are not.

Points recorded since Prism was installed are marked measured. The boundary
between the two is visible on the chart, which is the point — see
[signal provenance](../concepts/signal-provenance.md).

## Region movers

Alongside the line, Prism reports which areas of the repository moved most
between the last two points.

This is the actionable half. A three-point drop in the overall score is not a
task; "the checkout area's coupling factor fell twelve points since Tuesday" is.

## Reading a trend

**A step change** usually corresponds to one event — a large merge, a
dependency upgrade, a directory being moved. Region movers will name it.

**A slow drift** is the more expensive pattern, because nothing about any single
day looks wrong. This is the case the chart exists for; nobody notices drift by
reading a score once a week.

**A jump right after installing Prism** is often the backfill boundary rather
than a real change. Estimated and measured points are computed with different
amounts of information, and the marking on the chart tells you which you are
looking at.

## Not a target

A trend optimised directly stops measuring anything. The chart is a thermometer.

The useful loop is to watch for movement, use region movers to find what caused
it, and decide whether you care.

## Related

[Health score](../concepts/health-score.md) · [Engineering health](./health.md) · [Signal provenance](../concepts/signal-provenance.md)
