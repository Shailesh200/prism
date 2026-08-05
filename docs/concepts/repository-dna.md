# Repository DNA

**What this project is built out of — the frameworks, the tooling, the domains
it spans — with a confidence attached to each.**

It is the first thing to run on an unfamiliar repository, because everything
else makes more sense once you know whether you are looking at a Next.js app, a
Node service, or a monorepo containing both.

## What it reports

| | |
|---|---|
| **Stack signals** | The frameworks, libraries and tools detected, each with evidence |
| **Domains** | Frontend, backend, data, infrastructure — and how strongly each is present |
| **Packages** | In a monorepo, what is in each one |
| **Personas** | Who this repository is for, which sets sensible UI defaults |

## How detection works

Each detector looks for a specific combination of evidence and reports how much
it found:

| Evidence | Strength |
|---|---|
| A dedicated config file (`next.config.js`, `vite.config.ts`) | Strong |
| The dependency in `package.json` | Moderate |
| Import statements throughout the source | Strong when numerous |
| Conventional directory names (`pages/`, `app/`, `migrations/`) | Weak alone |

A detector that found a config file *and* three hundred matching imports is on
far firmer ground than one that found a single unused dependency. So Prism
reports the confidence rather than a flat yes or no, and lists the evidence so
you can check it.

This matters most for the false positives you would otherwise chase. A
`package.json` mentioning `jest` in a repository that actually runs Vitest is
common — a leftover from a migration. Prism will report Jest at low confidence
with `dependency only` as the evidence, which is enough to tell you what
happened.

## Domains

Prism sorts what it finds into four domains, and reports how much of the
repository falls in each:

| Domain | Signals |
|---|---|
| **Frontend** | UI frameworks, bundlers, component files, routes |
| **Backend** | Server frameworks, API route definitions, request handlers |
| **Data** | ORMs, migrations, schema files, query builders |
| **Infrastructure** | Containers, CI configuration, deployment manifests |

Domains drive what the extension shows you. A repository that is 90% frontend
does not need a database screen as its first tab.

## Using it

```bash
prism dna
prism stack        # just the detected stack signals
prism packages     # every package in the workspace and where it lives
```

In the extension, DNA is the summary at the top of the Overview, and the domain
breakdown determines which domain screens appear.

## Related

[Stack detection](./stack-detection.md) · [Signal provenance](./signal-provenance.md)
