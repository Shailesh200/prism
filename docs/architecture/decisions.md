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

**Core is the only supported integration surface for analysis** (ADR-0004).
Extensions, the CLI, and the MCP tools consume `@repo-prism/core`.

**Dispatch is removed** (ADR-0064). Dispatch (ADR-0035) was a second façade on
the `prism` MCP server for background jobs, standups, the Console, and Live
Relay. ADR-0064 removed it from the product and from MCP: no Dispatch tool is
registered. The last Prepare moved into Core, and memories moved to
`prism remember`. The `dispatch` and `dispatch-hub` packages
are deleted in a later milestone. Fixing a finding is the user's own chat.

**The default MCP surface is small** (M-091, Prism 2.0 plan §0.3). Nine tools
by default; the rest are opt-in through `extraTools` in
`~/.prism/config.json`.

**The cache is local and lives in your repository** (ADR-0010). SQLite in
`.prism/`. No cloud, no shared index, nothing to sign in to.

**Network integrations are opt-in, purpose by purpose** (ADR-0024). Every
optional capability that leaves your machine is a separate decision, enforced by
Core rather than by whoever calls it. See
[privacy](/privacy).

**Say what a number is made of** (ADR-0029). Every signal carries whether it was
measured, inferred or is unknown, and the interface shows it. See
[signal provenance](/docs/concepts/signal-provenance).

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
[Understand a repo](/docs/guides/understand-a-repo).

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

**Connectors belong to the agent window** (ADR-0049). Prism runs no OAuth of
its own and holds no third-party token. This supersedes the Prism Auth broker
(ADR-0036) and the per-host connect UX (ADR-0037), and retires
`auth.prismhq.in`. Dispatch used to discover which connectors were signed in
(names and capabilities, never a token); that discovery was removed with
Dispatch (ADR-0064).

The job-runner decisions that followed — worker sign-in (ADR-0038), job ids
(ADR-0039), parallel local workers (ADR-0040, ADR-0041), verification after a
job stopped (ADR-0042), and the jobs board (ADR-0043) — were superseded when
ADR-0058 stopped Prism running agents and ADR-0064 removed Dispatch.
Verification lives on in the receipt.

**MCP speaks over stdio, indexes lazily, and refuses consent-gated work**
(ADR-0030). See [using MCP](/docs/usage).

**The product screens are one shared package** (ADR-0021). The extension and the
playground render the same components.

**Cursor gets a packaging overlay, not a second extension** (ADR-0020). Same
build output, different marketplace identity.

**The product UI is dark, on a fixed token set** (ADR-0014). Re-picking colours
per screen is how a design system dies.

**The Core SDK is versioned and frozen within an API level** (ADR-0019). Methods
are not removed; result shapes only gain optional fields.

## Toolchain

**Bun, a pinned Node, and a locked performance-oriented toolchain** (ADR-0002,
ADR-0003). Chosen once, so that build speed is not relitigated per package.

## Reading a record

Each one states the context, the decision, the alternatives considered, and the
consequences — including the bad ones. A record that lists no downside is
usually a record that has not been thought through, and reviewers say so.

## Related

[Architecture overview](./overview.md) · [Packages](./packages.md) · [Contributing](https://github.com/Shailesh200/prism/blob/main/CONTRIBUTING.md)
