---
title: Risk bands
description: "One definition of Low / Moderate / High risk, shared by every surface."
---

Prism scores risk from 0 to 100 and sorts those scores into three bands. There
is exactly one definition of the boundaries, and every surface uses it.

## The bands

| Band | Score | Shown as |
|---|---|---|
| **Low** | 0–19 | Low Impact |
| **Moderate** | 20–59 | Moderate Impact |
| **High** | 60–100 | High Impact Potential |

Higher means more risk. Quality scores (health, testing) run the other way —
higher is better — but colour always puts green at the good end.

## Why bands

A raw score of 47 vs 44 is noise. Bands say "fine", "look at this", or "be
careful". Underlying factors beat the composite when you need finer distinctions.

## One definition, everywhere

Extension Blast Radius, CLI `--fail-on`, MCP responses, and change review all
call the same `riskToBand` helper. A CLI test fails the build if a threshold
literal appears in command code.

## Using bands in CI

```bash
prism blast src/payments/charge.ts --fail-on high
```

`--fail-on` fires **at or above** the band. `--fail-on mid` also fails on high.
Some commands take a count instead:

```bash
prism cycles --fail-on 0
```

`NaN` maps to Low rather than falling through comparison bounds.

## Related

[Wire into CI](/docs/guides/wire-into-ci) · [Signal provenance](/docs/concepts/signal-provenance)
