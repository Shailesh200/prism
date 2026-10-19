---
title: Known limitations
description: "What Prism cannot do: languages, static analysis limits and heuristics."
---

What Prism cannot do, stated plainly. A tool that hides its limits is a tool you
cannot calibrate against.

## Language coverage

Prism analyses the languages it has a plugin for: imports, symbols, references,
graphs.

In a repository written in a language Prism does not analyse yet, the tools
answer `PRISM_UNSUPPORTED`, the prompt hook adds one note instead of a pack, and
the receipt lists such files as `unsupported_language`. In a mixed repository,
Prism analyses the files it has a plugin for.

## Static analysis, and what that misses

Prism reads code. It does not run it.

Dynamic imports with computed paths, dependency injection resolved at runtime,
reflection, and string-keyed registries are invisible to it. A blast radius can
be an underestimate.

## Features are inferred

Repositories do not declare their features. Conventional layouts group well;
unusual ones group worse. Low confidence means treat the grouping as a
suggestion. See [graphs](/docs/concepts/graphs).

## Git is required for several signals

Churn, ownership, activity and change review all read
git history. Without git — or with a shallow clone — those signals are
unavailable rather than zero.

## Coverage must already exist

Prism reads coverage output from disk; it does not run your tests to produce it.
No coverage report means coverage is unavailable, which is not the same as zero.

## Large repositories

Indexing is linear in file count. Excluding generated output is the
highest-leverage fix.

## Monorepo boundaries

Package detection follows common workspace conventions. A custom layout may be
read as one large package.

## No cross-repository analysis

One repository at a time. A service that calls another across a network boundary
is, to Prism, an HTTP call to a string.

## No hosted version

By design. There is no account, no sync and no server.

## What Prism deliberately will not do

- **Write code itself.** Analysis has no model and generates nothing. Your
  agent makes the edit. The receipt runs this repository’s checks when the
  agent stops (or shows **—** if none exist).
- **Run background agents.** Background jobs were removed (ADR-0064).
- **Dump file bodies from Prepare.** `prepare_change` returns paths, symbols,
  and why — never source. Open the files yourself.
- **Resolve a finding because a file was edited.** Only a re-scan that drops
  the fingerprint closes it.
- **Write AGENTS.md into git.** Living AGENTS.md stays under `~/.prism`.
- **Veto writes from a work order** unless an Accepted ADR has armed that
  hook. The order is advisory by default.
- **Modify your repository unasked.** `rename` and `safe-delete` report; they
  never write. Besides the receipt's checks, the only path that executes
  anything is bundle measurement, behind explicit
  [privacy](/privacy).
- **Scan for vulnerabilities.** The security report checks whether left-shift
  tooling exists.
- **Send anything anywhere by default.** See
  [privacy](/privacy).

## Related

[Signal provenance](/docs/concepts/signal-provenance) ·
[Troubleshooting](/docs/help/troubleshooting) · [FAQ](/docs/help/faq)
