# Privacy

Prism analyses your code on your machine. There is no Prism account, no Prism
server, and no Prism cloud.

## The short version

| Question | Answer |
|---|---|
| Does my source code leave my machine? | No. |
| Is there telemetry, analytics, or crash reporting? | No. |
| Is there an account, licence check, or update ping? | No. |
| Does Prism ever make a network request? | Only for a purpose you have explicitly granted, listed below. |
| Where is my data stored? | `.prism/` inside the repository you opened. |

## What is proven, not just claimed

`packages/core/src/no-network.integration.test.ts` runs the whole analysis
surface — index, dependency and knowledge graphs, DNA, health, repository map,
blast radius, safe delete, explain, explore, test impact, and the engineering,
testing, security and backend reports — with `fetch` and
`net.Socket.prototype.connect` replaced by traps that record the attempt and
throw. Any outbound call fails the build and names the exact call site.

The suite also verifies that the traps themselves fire. Without that, it would
pass just as happily if they had never been installed, which is the most
dangerous kind of green.

It runs as part of `bun run verify:milestone`, so a future network call cannot
land quietly.

## The network requests Prism can make

Each is off until you turn it on, individually, in Settings → Privacy. Turning
one on says nothing about the others.

| Purpose | What happens | Where it goes |
|---|---|---|
| `network.github` | Fetches workflow runs and pull request metadata for your repository's remote | `api.github.com` |
| `network.github-user` | Dispatch reads your GitHub PRs, reviews, and notifications | `api.github.com` |
| `network.pagespeed` | Sends a URL you choose and reads back Core Web Vitals | `www.googleapis.com` |
| `network.package-install` | Installs the Lighthouse CLI into `.prism/tools` before measuring | your configured npm registry |
| `network.git-remote` | Runs `git fetch --prune` so branch counts are current, using your existing git credentials | your repository's git remote |
| `network.gravatar` | Requests contributor avatars, revealing a hash of each committer's email | `gravatar.com` |
| `network.linear` | Dispatch reads issues assigned to you | `api.linear.app` |
| `network.jira` | Dispatch reads unresolved issues assigned to you | `api.atlassian.com` |
| `network.slack` | Dispatch reads mentions and tracked channels/groups; does not post | `slack.com` |
| `network.notion` | Dispatch searches pages shared with the connected integration | `api.notion.com` |
| `network.google-calendar` | Dispatch reads today's calendar events | `www.googleapis.com` |

`run.local-build` is not a network purpose, but it is consented the same way: it
runs your repository's own build script so bundle weight can be measured.

Your decisions live in `.prism/consent.json`. Nothing else — not the CLI, not
the MCP server, not a direct SDK caller — can override them, and no caller can
assert consent on your behalf.

### About Gravatar specifically

Before version 0.1, Prism fetched contributor avatars from gravatar.com with no
toggle at all. That disclosed *who works on this repository* to a third party
nobody had opted into. Avatars are now drawn locally from a deterministic
gradient and initials; the remote lookup is opt-in and off by default. If you
previously enabled the old "allow network integrations" switch, it was **not**
carried over to Gravatar — that switch never mentioned it.

## What Prism stores, and where

Everything is under `.prism/` in the repository you opened:

| Path | Contents |
|---|---|
| `.prism/cache.db` | The SQLite index: file metadata, symbols, and graph edges derived from your code |
| `.prism/consent.json` | Your consent decisions |
| `.prism/history/` | Health scores over time |
| `.prism/tools/` | Locally installed measurement tools, if you consented to that |
| `.prism/dispatch/` | Dispatch jobs, config, memories (gitignored) |

No credential of any kind is written to `.prism/`.

**Prism holds no third-party credentials.** Earlier versions ran an OAuth
broker at `auth.prismhq.in` so Dispatch could read Slack, Linear, Jira, Notion,
GitHub and Google Calendar. That is gone, and the service is retired. Dispatch
makes no network calls at all.

Those services are now reached by your agent window — Cursor or Claude Code —
using connectors you authenticated there. Prism reads your editor's plugin and
MCP manifests to learn which connectors exist: names, descriptions and skill
lists only. It does not read tokens, secrets or OAuth client secrets, and
discovery opens no network connection. When a briefing needs Slack, Prism names
the section and your agent makes the call.

Prism offers to add `.prism/` to your `.gitignore`. It contains no secrets, but
it is derived build output and does not belong in version control.

## Decisions of record

- **No cloud sync, ever** (Q-009, resolved 2026-08-05). The architecture stays
  local-first; there is no roadmap item that changes this.
- **No telemetry, not even opt-in anonymous counters** (Q-010, resolved
  2026-08-05).

See [ADR-0024](./plans/adr/0024-opt-in-network-integrations.md) for the consent
model and [the threat model](./plans/architecture/07_THREAT_MODEL.md) for what
Prism executes and why.
