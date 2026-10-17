---
title: Signal provenance
description: "Every number says where it came from: measured, estimated or unavailable."
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
| **Heuristic** | A useful rule (follow-through, reuse score) that is not a parse |
| **Inferred** | Feature membership or similar-by-name — not load-bearing until you open the file |

Graph edges on Intelligence tools carry `measured` | `heuristic` | `inferred`.

Surfaces show this: fields in `--json` and MCP results, labels in the CLI. Estimated figures are labelled; unavailable ones are absent rather than
zero.

## Unavailable is a real answer

No git history → no ownership section (not "0 contributors"). No coverage
report → no coverage figure (not `0%`). A zero and an absence mean different
things.

## Estimated is honest, not useless

Ownership and churn on a shallow clone are marked estimated or unavailable,
never shown as zero.

## Related

[Risk bands](/docs/concepts/risk-bands) · [privacy](/privacy)
