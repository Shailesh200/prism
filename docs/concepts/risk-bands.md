# Risk bands

**Prism scores risk from 0 to 100 and sorts those scores into three bands. There
is exactly one definition of where the boundaries are, and every surface uses
it.**

## The bands

| Band | Score | Shown as |
|---|---|---|
| **Low** | 0–19 | Low Impact |
| **Moderate** | 20–59 | Moderate Impact |
| **High** | 60–100 | High Impact Potential |

Higher means more risk. This is worth stating because Prism also reports
*quality* scores — health, testing, security — where higher means better. The
surfaces colour both consistently: green is always the good end, whichever
direction that is.

## Why bands at all

A raw score of 47 invites a false question: is 47 meaningfully different from
44? It is not. These scores come from weighted heuristics, and their third
significant figure is noise.

Bands say what the number is for: a rough sort into "fine", "look at this", and
"be careful". If you need finer distinctions than that, the underlying factors
are more informative than the composite anyway.

## One definition, everywhere

The extension's Blast Radius screen, the CLI's `--fail-on` flag, an MCP tool's
response and the change-review panel all call the same function.

This sounds obvious and was not always true. Blast Radius and Change Review each
carried their own copy of the thresholds, and other parts of the codebase banded
the same number differently. The result was one score described two ways
depending on where you were standing — which is worse than either description
alone, because now the user has to work out which one to believe.

Anything that bands a score in Prism uses the shared `riskToBand`. A test in the
CLI package fails the build if a threshold literal appears in command code.

## Using bands in CI

`--fail-on` takes a band name and exits `1` when the result is at or above it:

```bash
prism blast src/payments/charge.ts --fail-on high
```

At or above, not "in". `--fail-on mid` also fails on high, because you almost
never want a gate that passes on the worst case.

Some commands take a count instead of a band, where a band would be meaningless:

```bash
prism cycles --fail-on 0     # fail if there are any cycles at all
```

## An edge case worth knowing

`riskToBand` maps `NaN` to Low rather than letting it fall through. A `NaN`
compares false against every bound, so without that it would silently land in
whichever branch came last — and a broken calculation would present itself as
high risk, or as low, depending on the order the code happened to be written in.
Neither is acceptable, so the case is handled explicitly.

## Related

[Blast radius](./blast-radius.md) · [Health score](./health-score.md) · [Signal provenance](./signal-provenance.md)
