---
title: Known limitations
description: "What Prism cannot do, stated plainly — languages, static analysis, heuristics."
---

What Prism cannot do, stated plainly. A tool that hides its limits is a tool you
cannot calibrate against.

## Language coverage

TypeScript and JavaScript are fully analysed: imports, symbols, references,
graphs.

Everything else is indexed for structure, size and churn only. In a Python or Go
repository you get the map, file-level metrics and git-derived signals, but not
symbol-level analysis. Prism is a JavaScript-ecosystem tool that does not fall
over on other languages.

## Static analysis, and what that misses

Prism reads code. It does not run it.

Dynamic imports with computed paths, dependency injection resolved at runtime,
reflection, and string-keyed registries are invisible to it. A blast radius can
be an underestimate.

## Features are inferred

Repositories do not declare their features. Conventional layouts group well;
unusual ones group worse. Low confidence means treat the grouping as a
suggestion. See [graphs](/docs/concepts/graphs).

## Health scores are heuristics

The health score has no ground truth to be validated against. It correlates with
maintenance cost in the repositories it was designed on; it is not a
measurement. It cannot see correctness, performance, or whether the software
does anything useful. Read the factors. See [Track health](/docs/guides/track-health).

## Git is required for several signals

Churn, ownership, activity, health history backfill and change review all read
git history. Without git — or with a shallow clone — those signals are
unavailable rather than zero.

## Coverage must already exist

Prism reads coverage output from disk; it does not run your tests to produce it.
No coverage report means coverage is unavailable, which is not the same as zero.

## Large repositories

Indexing is linear in file count. The map becomes hard to read at file level in
a repository of tens of thousands of files — package and feature zoom exist for
that reason. Excluding generated output is the highest-leverage fix.

## Monorepo boundaries

Package detection follows common workspace conventions. A custom layout may be
read as one large package.

## No cross-repository analysis

One repository at a time. A service that calls another across a network boundary
is, to Prism, an HTTP call to a string.

## No hosted version

By design. There is no account, no sync and no server.

## What Prism deliberately will not do

- **Write code.** Not a code generator, and no model is involved.
- **Modify your repository.** `rename` and `safe-delete` report; they never
  write. The only path that executes anything is bundle measurement, behind
  explicit [`run.local-build` consent](/docs/concepts/consent-and-privacy).
- **Scan for vulnerabilities.** The security report checks whether left-shift
  tooling exists.
- **Send anything anywhere by default.** See
  [consent and privacy](/docs/concepts/consent-and-privacy).

## Related

[Signal provenance](/docs/concepts/signal-provenance) ·
[Troubleshooting](/docs/reference/troubleshooting) · [FAQ](/docs/reference/faq)
