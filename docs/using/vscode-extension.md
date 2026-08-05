# Using the VS Code extension

**The visual surface. Same engine as the CLI, same numbers, arranged for
reading rather than scripting.**

Install **RepoPrism** (`prismhq.repo-prism`), then: open a folder → Command
Palette → **Prism: Open Prism**.

## The first thing that happens

Prism indexes the workspace. The first index of a large repository takes a few
seconds; afterwards it updates incrementally as you save.

Until the index exists, screens that need it say so rather than showing zeroes.
An empty chart and an unbuilt index look identical otherwise, and they mean
completely different things.

## The screens

| Screen | What it is for |
|---|---|
| **Overview** | The state of the repository at a glance: health, DNA, activity, the most connected files |
| **Map** | The [repository map](../features/map.md) — structure, laid out spatially, with layers |
| **Domains** | Frontend, backend, data, infrastructure — whichever this repository actually has |
| **Impact** | [Blast radius](../concepts/blast-radius.md), safe delete, rename impact |
| **Trends** | Health over time, and which areas moved |
| **Integrations** | Optional connectors, each individually consented |
| **Settings** | Indexing, appearance, and privacy |

Which domain screens appear depends on what [DNA](../concepts/repository-dna.md)
detected. A pure frontend repository does not get a database screen.

## Reading the interface

**Provenance markers.** A value marked estimated was inferred, not measured. A
value that is absent is one Prism does not know. Neither is a rendering bug —
see [signal provenance](../concepts/signal-provenance.md).

**Risk colour.** Green through amber to red maps to the
[risk bands](../concepts/risk-bands.md), and always runs good-to-bad in that
direction — including on quality scores where the number runs the other way.

**Confidence percentages.** On features and stack signals, these say how much
evidence agreed. Low confidence means look before you act.

## Working in it

**Pick a file, ask what it costs.** Impact → enter a path → blast radius, tests
affected, features touched.

**Review what you are about to commit.** The change review reads your working
tree and reports aggregate risk across every changed file, which is the question
a reviewer will ask.

**Follow the map.** Zoom levels run repository → package → feature → file →
symbol. Layers overlay a dimension — coupling, churn, test coverage, risk — onto
that structure.

## Settings worth setting early

| Setting | Why |
|---|---|
| **Exclude globs** | If indexing is slow or the file count looks wrong, this is usually it |
| **Max file size** | Generated bundles and vendored code are worth skipping |
| **Auto re-index** | On by default; the interval is adjustable |
| **Privacy** | Every optional network feature, individually |

## Related

[Map](../features/map.md) · [Impact analysis](../features/impact-analysis.md) · [Consent and privacy](../concepts/consent-and-privacy.md)
