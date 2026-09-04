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

Decisions live in `.prism/consent.json`. Callers cannot assert consent.

**`network.gravatar`** stays off unless you say otherwise.

## Agents and consent

Intelligence MCP tools stay read-only: Core network APIs are absent, not
guarded. Every purpose above is a Core analysis feature you turn on yourself.

## Connectors are your editor's, not Prism's

Prism used to run its own OAuth for Slack, Linear, Jira, Notion, GitHub and
Google Calendar. It no longer does, and the hosted broker at `auth.prismhq.in`
is retired (ADR-0049).

Dispatch now makes **no network calls at all**. When a standup or a workflow
needs one of those services, Prism names the section and your agent window —
Cursor or Claude Code — calls its own connector, with the grant you already
gave it there. Prism never holds a third-party token, because the call never
happens inside Prism.

Prism does read your editor's plugin and MCP manifests to know *which*
connectors exist. That is names and capabilities only: no tokens, no secrets,
and no network access.

## What is stored

Index, consent, and health history under `.prism/`. Dispatch job state under
`.prism/dispatch/`, gitignored. No third-party credentials anywhere.

## Related

[PRIVACY.md](https://github.com/Shailesh200/prism/blob/main/PRIVACY.md) ·
[SECURITY.md](https://github.com/Shailesh200/prism/blob/main/SECURITY.md)
