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
| `network.github-user` | Dispatch: your GitHub PRs, reviews, notifications | `api.github.com` |
| `network.pagespeed` | Sends a URL you choose, reads Core Web Vitals | `www.googleapis.com` |
| `network.package-install` | Installs the Lighthouse CLI before measuring | your npm registry |
| `network.git-remote` | Runs `git fetch --prune` for branch counts | your git remote |
| `network.gravatar` | Fetches contributor avatars (email hashes) | `gravatar.com` |
| `network.linear` | Dispatch: issues assigned to you | `api.linear.app` |
| `network.jira` | Dispatch: unresolved issues assigned to you | `api.atlassian.com` |
| `network.slack` | Dispatch: mentions + tracked channels (no post) | `slack.com` |
| `network.notion` | Dispatch: recent pages you shared with the app | `api.notion.com` |
| `network.google-calendar` | Dispatch: today's events, read-only | `www.googleapis.com` |
| `run.local-build` | Runs your repository's own build for bundle weight | your shell |

Decisions live in `.prism/consent.json`. Callers cannot assert consent.

**`network.gravatar`** stays off unless you say otherwise.

## Agents and consent

Intelligence MCP tools stay read-only: Core network APIs are absent, not
guarded. Dispatch drivers turn on when **you** say “connect …” and finish OAuth
in the browser — that grant is yours, not the model's. See
[Dispatch](/docs/mcp/dispatch).

## What is stored

**Dispatch drivers.** Saying “connect Google Calendar” (or Slack, GitHub, …)
opens Prism Auth (`https://auth.prismhq.in`) — Cursor via Authenticate, Claude
by opening the page. That broker holds Prism's vendor
OAuth apps, exchanges the code, and returns a short-lived pickup to your local
MCP. Access tokens stay in the OS keychain. The broker does not see your
repository or index. Completing the vendor grant is the human consent.

Index, consent, and health history under `.prism/`. Dispatch user tokens live in
the OS keychain (gitignored fallback only if keychain is missing).

## Related

[PRIVACY.md](https://github.com/Shailesh200/prism/blob/main/PRIVACY.md) ·
[SECURITY.md](https://github.com/Shailesh200/prism/blob/main/SECURITY.md)
