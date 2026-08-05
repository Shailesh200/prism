# Consent and privacy

**Prism analyses your code without touching the network. A few optional features
do reach out, and each is a separate decision you make explicitly.**

For the complete statement, see [PRIVACY.md](https://github.com/Shailesh200/prism/blob/main/PRIVACY.md). This page
explains how the mechanism works and why it is shaped the way it is.

## The default

No account. No telemetry. No analytics. No licence check. No update ping.

Indexing, graphs, DNA, health, the map, blast radius, and every report make zero
network calls. This is not a policy — it is enforced by a test that runs the
whole analysis surface with the socket layer replaced by traps that record and
throw. A future change that adds a network call to an analysis path fails the
build and names the call site.

That test also checks that the traps themselves fire. Without that it would pass
just as happily if they were never installed, which is the most dangerous kind
of green.

## The optional features

Each is off until you turn it on, individually.

| Purpose | What happens | Where it goes |
|---|---|---|
| `network.github` | Fetches workflow runs and pull request metadata | `api.github.com` |
| `network.pagespeed` | Sends a URL you choose, reads back Core Web Vitals | `www.googleapis.com` |
| `network.package-install` | Installs the Lighthouse CLI before measuring | your npm registry |
| `network.git-remote` | Runs `git fetch --prune` for current branch counts | your git remote |
| `network.gravatar` | Fetches contributor avatars, revealing email hashes | `gravatar.com` |
| `run.local-build` | Runs your repository's own build script to measure bundle weight | your shell |

Turning one on says nothing about the others. There is no master switch, and
that is deliberate: a single "allow network features" toggle asks you to agree
to a category rather than to a consequence, and nobody can consent to a category
they cannot enumerate.

## Where the decision lives

In `.prism/consent.json`, inside the repository, read by the engine itself.

That location is the whole design. Because the engine reads it, every surface is
bound by it — the extension, the CLI, an MCP agent, and a direct SDK caller all
get the same answer, and none of them can pass a "the user said yes" flag to
route around it.

An earlier version of Prism got this wrong in a way worth stating plainly: the
authority was a browser setting, and the engine's gate accepted a consent flag
from whoever called it. Every caller passed `true`. The gate recorded consent
rather than requiring it. That is fixed, and the shape of the fix — the decision
lives with the engine, callers cannot assert it — is why it cannot recur.

## Two purposes worth reading twice

**`network.gravatar`** is off, and stays off unless you say otherwise. Fetching
an avatar discloses a hash of a committer's email address to a third party —
that is, it tells someone else who works on your repository. Prism draws avatars
locally instead, from a deterministic gradient and initials.

**`run.local-build`** executes your repository's own build script. Measuring a
bundle requires producing one, and only the project's build knows how. So
granting this on an unfamiliar repository is equivalent to cloning it and typing
`npm run build`. Nothing on the analysis path does this — opening and exploring
a repository is safe; measuring its bundle is the step that is not. See the
[threat model](https://github.com/Shailesh200/prism/blob/main/plans/architecture/07_THREAT_MODEL.md).

## Agents cannot consent for you

The MCP server exposes read-only tools and nothing else. No consent-gated
capability is reachable from an agent — not guarded, absent.

An agent cannot give informed consent on your behalf, so the alternative would
be an agent that fetches from GitHub because it decided that was helpful.

## What is stored

Everything in `.prism/`: the index, your consent decisions, health history, and
anything you consented to fetch. No credential is ever written there — a
contract test asserts that no Core data structure even has a field named for a
token, key or secret.

## Related

[PRIVACY.md](https://github.com/Shailesh200/prism/blob/main/PRIVACY.md) · [SECURITY.md](https://github.com/Shailesh200/prism/blob/main/SECURITY.md) · [Threat model](https://github.com/Shailesh200/prism/blob/main/plans/architecture/07_THREAT_MODEL.md)
