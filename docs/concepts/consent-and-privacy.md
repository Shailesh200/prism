---
title: Consent and privacy
description: "Local analysis by default; optional network features are individual decisions."
---

Prism analyses your code without touching the network. A few optional features
do reach out, and each is a separate decision you make explicitly.

For the complete statement, see
[PRIVACY.md](https://github.com/Shailesh200/prism/blob/main/PRIVACY.md).

## The default

No account. No telemetry. No analytics. No licence check. No update ping.

Indexing, graphs, DNA, health, the map, blast radius, and every report make zero
network calls — enforced by a test that traps the socket layer. A future change
that adds a network call to an analysis path fails the build.

## The optional features

Each is off until you turn it on, individually. There is no master switch.

| Purpose | What happens | Where it goes |
|---|---|---|
| `network.github` | Fetches workflow runs and PR metadata | `api.github.com` |
| `network.pagespeed` | Sends a URL you choose, reads Core Web Vitals | `www.googleapis.com` |
| `network.package-install` | Installs the Lighthouse CLI before measuring | your npm registry |
| `network.git-remote` | Runs `git fetch --prune` for branch counts | your git remote |
| `network.gravatar` | Fetches contributor avatars (email hashes) | `gravatar.com` |
| `run.local-build` | Runs your repository's own build for bundle weight | your shell |

Decisions live in `.prism/consent.json`, read by the engine itself — every
surface is bound by it; callers cannot assert consent.

**`network.gravatar`** stays off unless you say otherwise — avatars disclose
email hashes. Prism draws local avatars instead.

**`run.local-build`** runs your build script. Granting it on an unfamiliar repo
is equivalent to cloning and typing `npm run build`.

## Agents cannot consent for you

The MCP server exposes read-only tools only. No consent-gated capability is
reachable from an agent — absent, not guarded.

## What is stored

Everything in `.prism/`: index, consent, health history, consented fetches. No
credential is ever written there.

## Related

[PRIVACY.md](https://github.com/Shailesh200/prism/blob/main/PRIVACY.md) ·
[SECURITY.md](https://github.com/Shailesh200/prism/blob/main/SECURITY.md)
