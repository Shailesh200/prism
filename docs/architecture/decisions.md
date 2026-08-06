---
title: Architecture decisions
description: "ADRs behind Prism, in plain language."
---


**Prism records every significant architectural choice as a short document — an
Architectural Decision Record, or ADR — saying what was decided and why. This
page is that list in plain language.**

The records themselves live in
[`plans/adr/`](https://github.com/Shailesh200/prism/tree/main/plans/adr).

## The ones that shape everything

**Core is the only supported integration surface** (ADR-0004). Extensions, the
CLI, the MCP server and the playground consume `@repo-prism/core` and nothing deeper.
This is why the surfaces cannot disagree, and it has already paid for itself:
test-runner logic that had been duplicated between the extension and the
playground drifted apart and turned out to hold two different bugs.

**The cache is local and lives in your repository** (ADR-0010). SQLite in
`.prism/`. No cloud, no shared index, nothing to sign in to.

**Network integrations are opt-in, purpose by purpose** (ADR-0024). Every
optional capability that leaves your machine is a separate decision, enforced by
Core rather than by whoever calls it. See
[consent and privacy](../concepts/consent-and-privacy.md).

**Say what a number is made of** (ADR-0029). Every signal carries whether it was
measured, inferred or is unknown, and the interface shows it. See
[signal provenance](../concepts/signal-provenance.md).

## How code is read

**Oxc parses TypeScript and JavaScript** (ADR-0009). Fast, and good enough for
imports, symbols and references. Deep type-aware analysis is deliberately left
open rather than promised.

**Language plugins are isolated behind a versioned interface** (ADR-0005). A
plugin cannot destabilise the host, and adding a language does not mean editing
the pipeline.

**Content is hashed with SHA-256** (ADR-0006). The basis of incremental
indexing: same hash, no re-parse.

**Watch invalidation works on whole files** (ADR-0026). A coarser unit than
strictly necessary, chosen because a correct invalidation that is slightly
conservative beats a precise one that occasionally misses.

## How judgement is formed

**Health is weighted across five factors** (ADR-0012). The weights are written
down so you can disagree with them precisely. See
[Track health](../guides/track-health.mdx).

**Features are inferred, and confidence is shown** (ADR-0011). Repositories do
not declare their features, so Prism guesses and says how sure it is.

**Stack detection is pluggable, including developer personas** (ADR-0007). A
detector declares the evidence it looks for and how much each piece counts.

**Blast radius uses multiple lanes of evidence** (ADR-0027). Hard edges from
imports, soft edges from weaker signals, reported separately rather than blended
into one number that hides which is which.

**Engineering health complements the score rather than replacing it**
(ADR-0017). One number to glance at; a detailed report to act on.

**Trends are stored, and history is backfilled from git** (ADR-0023). Backfilled
points are marked estimated so a reconstructed trend never looks measured.

## Surfaces

**MCP speaks over stdio, indexes lazily, and refuses consent-gated work**
(ADR-0030). See [using MCP](../mcp/usage.md).

**The product screens are one shared package** (ADR-0021). The extension and the
playground render the same components.

**Cursor gets a packaging overlay, not a second extension** (ADR-0020). Same
build output, different marketplace identity.

**The product UI is dark, on a fixed token set** (ADR-0014). Re-picking colours
per screen is how a design system dies.

**The Core SDK is versioned and frozen within an API level** (ADR-0019). Methods
are not removed; result shapes only gain optional fields.

## Toolchain

**Bun, Node 26, and a locked performance-oriented toolchain** (ADR-0002,
ADR-0003). Chosen once, so that build speed is not relitigated per package.

## Reading a record

Each one states the context, the decision, the alternatives considered, and the
consequences — including the bad ones. A record that lists no downside is
usually a record that has not been thought through, and reviewers say so.

## Related

[Architecture overview](./overview.md) · [Packages](./packages.md) · [Contributing](https://github.com/Shailesh200/prism/blob/main/CONTRIBUTING.md)
