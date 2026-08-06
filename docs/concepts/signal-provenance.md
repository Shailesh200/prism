---
title: Signal provenance
description: "Every number carries where it came from — measured, estimated, or unavailable."
---

Every number Prism shows carries a record of where it came from. That is why
Prism sometimes shows you nothing.

## The problem

A dashboard that says "Test coverage: 62%" without saying whether that was
measured, estimated, stale, or a default is decoration — or worse, confident
fiction.

## What Prism does

| Provenance | Meaning |
|---|---|
| **Measured** | Prism ran something, or read a real artefact |
| **Derived** | Computed from the index by a deterministic rule |
| **Estimated** | Inferred from indirect evidence — directionally useful |
| **Unavailable** | Prism does not know, and will not pretend to |

Surfaces show this: markers in the extension, fields in `--json`, labels in the
CLI. Estimated figures are labelled; unavailable ones are absent rather than
zero.

## Unavailable is a real answer

No git history → no ownership section (not "0 contributors"). No coverage
report → no coverage figure (not `0%`). A zero and an absence mean different
things.

## Estimated is honest, not useless

Health history on day one may backfill earlier points from git, marked
estimated. As real snapshots accumulate, they replace estimates. Both appear,
distinguished.

## Related

[Risk bands](/docs/concepts/risk-bands) · [Consent and privacy](/docs/concepts/consent-and-privacy)
