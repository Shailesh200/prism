# Domain screens

**Repositories are not uniform. A React app and a Postgres schema raise
different questions, so Prism shows different screens for each.**

Which screens appear depends on what [DNA detection](../concepts/repository-dna.md)
found. A pure frontend repository does not get a database screen — an empty
screen for something you do not have is worse than no screen.

## Frontend

For repositories with a detected UI framework.

| Panel | What it shows |
|---|---|
| **Components** | The component tree, and which components are reused versus one-off |
| **Routes** | Every route, and what renders it |
| **State** | Detected state management and where it is read and written |
| **Bundle weight** | Size by entry point and module, from a build artifact |
| **Web vitals** | Core Web Vitals for a URL you supply |

**Bundle weight** needs a real build, so it is gated behind
[`run.local-build` consent](../concepts/consent-and-privacy.md) — measuring a
bundle means producing one, and only your project's build script knows how.
Prism can also ingest a stats artifact you already have, which needs no consent
at all — once ingested, the report is available from the terminal:

```bash
prism bundle --artifact <id>
```

**Web vitals** needs Lighthouse, and sends a URL you choose to a Google API.
Separately consented; off by default.

## Backend

For repositories with a detected server framework.

| Panel | What it shows |
|---|---|
| **Routes** | Endpoints, methods, and their handlers |
| **Data layer** | ORM usage, queries, and the models behind them |
| **Environment** | Every environment variable the code reads, and where |
| **Jobs** | Background jobs, queues and schedules |

The environment panel is quietly one of the most useful screens in Prism. "Which
variables does this service actually need" is a question every deployment asks
and no repository answers, because the answer is scattered across every file
that calls `process.env`.

```bash
prism backend
```

## Data

For repositories with a detected schema or migrations.

Tables and their relationships, migration history, and where each model is used
from application code — the last of which connects a schema change to the code
that will break.

## Infrastructure

For repositories with detected IaC, containers or CI.

Container definitions, CI workflows and their triggers, and infrastructure
resources. Alongside the [security checklist](./health.md#security-report), this
answers "what does this repository actually deploy".

## When a screen is missing

Prism did not detect that domain. `prism dna` shows what was detected and with
what confidence; a low-confidence detection usually means an unusual project
layout.

## Related

[Repository DNA](../concepts/repository-dna.md) · [Stack detection](../concepts/stack-detection.md) · [Consent and privacy](../concepts/consent-and-privacy.md)
