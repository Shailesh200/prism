---
title: DNA and stack
description: "What a repository is built from — detectors, domains, and confidence."
---

**Repository DNA** is what the project is built out of: frameworks, tooling, and
domains, each with confidence. **Stack detection** is the mechanism behind it.

## What DNA reports

| | |
|---|---|
| **Stack signals** | Frameworks, libraries and tools, each with evidence |
| **Domains** | Frontend, backend, data, infrastructure — and how strongly each is present |
| **Packages** | In a monorepo, what is in each one |
| **Personas** | Who this repository is for (UI defaults) |

## How detection works

Each detector looks for evidence and reports how much it found:

| Evidence | Strength |
|---|---|
| Dedicated config (`next.config.js`, `vite.config.ts`) | Strong |
| Dependency in `package.json` | Moderate |
| Import statements throughout source | Strong when numerous |
| Conventional directories (`pages/`, `app/`, `migrations/`) | Weak alone |

`package.json` lies routinely — stale deps, spikes that stayed, lockfile noise.
Combining manifest + imports + config, and listing evidence, is what makes the
answer actionable.

```bash
prism dna
prism stack
prism packages
```

## Domains

| Domain | Signals |
|---|---|
| **Frontend** | UI frameworks, bundlers, components, routes |
| **Backend** | Server frameworks, API routes, handlers |
| **Data** | ORMs, migrations, schemas, query builders |
| **Infrastructure** | Containers, CI, deployment manifests |

Domains drive which extension screens appear.

## When detection is wrong

- Stale dependency at low confidence with `dependency only` — working as intended.
- Missing framework you use — unusual setup; analysis still derives from imports.
- Wrong version — Prism reads the lockfile; if that is stale, so is the version.

Detectors live in `@repo-prism/intelligence` and are extension points without
touching the pipeline.

## Related

[Signal provenance](/docs/concepts/signal-provenance) ·
[Understand a repo](/docs/guides/understand-a-repo)
