# Known limitations

**What Prism cannot do, stated plainly. A tool that hides its limits is a tool
you cannot calibrate against.**

## Language coverage

TypeScript and JavaScript are fully analysed: imports, symbols, references,
graphs.

Everything else is indexed for structure, size and churn only. In a Python or Go
repository you get the map, file-level metrics and git-derived signals, but not
symbol-level analysis. That is a real gap for polyglot repositories and the
honest summary is: Prism is a JavaScript-ecosystem tool that does not fall over
on other languages.

## Static analysis, and what that misses

Prism reads code. It does not run it.

Dynamic imports with computed paths, dependency injection resolved at runtime,
reflection, and string-keyed registries are invisible to it. A file reached only
by `import(`./handlers/${name}.js`)` will look less depended-upon than it is.

The consequence to keep in mind: a blast radius can be an underestimate. Prism
biases towards including a maybe-dependent for exactly this reason, but a call
graph assembled at runtime cannot be recovered from source.

## Features are inferred

Repositories do not declare their features, so Prism infers them from imports,
naming and directory structure. Conventional layouts group well; unusual ones
group worse. The confidence percentage is the signal to read — low confidence
means treat the grouping as a suggestion.

## Health scores are heuristics

The [health score](../concepts/health-score.md) has no ground truth to be
validated against. It correlates with maintenance cost in the repositories it
was designed on; it is not a measurement.

It also cannot see correctness, performance, security posture, or whether the
software does anything useful. A well-structured implementation of the wrong
thing scores well.

Read the factors. The number is a summary, not a verdict.

## Git is required for several signals

Churn, ownership, activity, health history backfill and change review all read
git history. Without git — or with a shallow clone, which is the common case in
CI — those signals are unavailable rather than zero.

`git clone --depth 1` is the usual cause of a surprisingly empty churn layer.

## Coverage must already exist

Prism reads coverage output from disk; it does not run your tests to produce it.
No coverage report means coverage is unavailable, which is not the same as zero.

## Large repositories

Indexing is linear in file count and the first run in a very large monorepo takes
noticeably longer. The map becomes hard to read at file level in a repository of
tens of thousands of files — package and feature zoom levels exist for that
reason, but this is a genuine ceiling rather than a solved problem.

Excluding generated output is the single highest-leverage fix, and generated
output is usually why a count is surprising.

## Monorepo boundaries

Package detection follows the common workspace conventions. A custom monorepo
layout that does not use them will be read as one large package, which makes
package-level aggregation less useful. Nothing breaks; the view is just coarser.

## No cross-repository analysis

One repository at a time. A service that calls another service across a network
boundary is, to Prism, a service that makes an HTTP call to a string.

## No hosted version

By design, not by roadmap. There is no account, no sync and no server. If you
want the index on another machine, index there.

## What Prism deliberately will not do

- **Write code.** Not a code generator, and no model is involved.
- **Modify your repository.** `rename` and `safe-delete` report; they never
  write. The only path that executes anything is bundle measurement, behind
  explicit [`run.local-build` consent](../concepts/consent-and-privacy.md).
- **Scan for vulnerabilities.** The security report checks whether left-shift
  tooling exists, which is a different claim.
- **Send anything anywhere by default.** See
  [consent and privacy](../concepts/consent-and-privacy.md).

## Related

[Signal provenance](../concepts/signal-provenance.md) · [Troubleshooting](./troubleshooting.md) · [FAQ](./faq.md)
