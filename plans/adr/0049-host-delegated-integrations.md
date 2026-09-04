# ADR-0049: Delegate connectors to the host agent

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-03 |
| Decision makers | Owner, Architect |
| Related milestones | [M-067](../milestones/M-067_shippable-product.md) |
| Supersedes | [ADR-0036](./0036-prism-auth-broker.md), [ADR-0037](./0037-connect-ux-per-host.md) |
| Amends | [ADR-0035](./0035-dispatch-vertical.md) (removes OAuth from the Dispatch vertical) |

## Context

Prism ships its own OAuth stack: six drivers, a hosted broker at
`auth.prismhq.in`, website `/oauth/*` routes, per-vendor Prism-owned OAuth
apps, keychain token storage, and a refresh path. It is roughly four thousand
lines and a piece of always-on hosted infrastructure.

Exactly one feature reads a token: `start_my_day`. Nothing else in Prism has
ever called a connector.

Meanwhile the agent windows Prism runs inside already have these connectors,
better. On this machine `~/.cursor/plugins/cache/cursor-public/` holds six
plugins — Slack, Linear, Notion, Google Calendar, Sentry, Vercel — each with a
`.cursor-plugin/plugin.json`, a `.claude-plugin/plugin.json`, an `.mcp.json`,
`skills/` and `commands/`. The user authenticated those once, in their editor,
against the vendor's own OAuth app. Cursor and Claude Code maintain them.

So Prism is operating a second, worse copy of something the host already does,
and paying for hosted infrastructure to do it. Worse, the two copies are
independent: connecting Slack in Cursor does nothing for Prism, and a user who
has done the work once is asked to do it again.

The cost is not only maintenance. It is the only always-on network dependency
in a product whose first promise is local-first.

## Decision

**Prism stops being an integration hub. The host agent owns connectors; Prism
owns intelligence, jobs, and the local spine.**

1. **Read-only host discovery.** A new module walks the places hosts keep
   live plugin and MCP session state and reports *what is signed in*: names,
   descriptions, skills, and the transport an MCP server uses. Nothing else.
   It reads no token, no secret, no OAuth client secret, and it never opens a
   network connection.

   Locations walked: Cursor's per-workspace session MCP under
   `~/.cursor/projects/<slug>/mcps/<server>/` (usable tools, not `mcp_auth`
   alone — the plugin cache at `~/.cursor/plugins/cache` is a download, not a
   connection); `~/.cursor/mcp.json`; `<workspace>/.cursor/mcp.json`;
   `~/.claude.json`; `<workspace>/.mcp.json`; and `~/.claude/plugins/`
   (skipping the marketplace catalogue).

2. **`start_my_day` returns a spine plus a fill contract.** Prism supplies what
   only Prism can: git state, jobs, memories. For everything else it names the
   section, says which host connector could fill it, and asks the host agent to
   fill it with tools it already has. The briefing stops being a thing Prism
   fetches and becomes a thing Prism *composes*.

3. **The OAuth stack is deleted, not deprecated.** `@repo-prism/dispatch-auth`,
   the six drivers, the broker client, keychain token storage, token refresh,
   the per-host connect UX, the loopback consent page, the `integrations` MCP
   tool, `apps/website/app/oauth/*`, and the six `network.*` Dispatch consent
   purposes all go. Leaving them behind as dead code would be worse than either
   keeping or deleting them: it invites a future contributor to wire them back
   up against infrastructure that no longer exists.

4. **Build the replacement inside this phase.** Discovery and the fill contract
   land before the deletion, in the same phase, so `start_my_day` never
   regresses in between.

## Why this is not what ADR-0036 rejected

ADR-0036 considered and rejected *reading another MCP server's tokens*. That
remains impossible and remains rejected — this decision does not do it.

The distinction is where the call happens. Prism does not obtain a Slack token
and call Slack. Prism tells the host agent "this briefing has a Slack section
and you have Slack tools", and the **host agent** calls Slack with its own
credentials, in its own process, under its own consent. Prism never sees a
token because a token never enters Prism.

Discovery reads live session tools (and host MCP configs) to know a
connector is signed in. A download sitting in Cursor's plugin cache is the
same information as an unsigned plugin in the editor: present, not connected.

## Options considered

### Option A — Host delegation, delete the stack (chosen)

The user authenticates once, where they already were. Prism's network surface
for Dispatch drops to zero. `auth.prismhq.in` can be retired and six vendor
OAuth apps revoked. Different organisations get different connectors for free,
because the answer is whatever the developer has signed in.

Cost: `start_my_day` can no longer fill a briefing on its own. It depends on
the host agent cooperating with the fill contract, and a host with no
connectors gets a thinner briefing than Prism used to produce. That is honest —
it reflects what is actually connected — but it is a real reduction for a user
who had connected Prism Auth and has nothing in their editor.

### Option B — Keep Prism Auth, add discovery alongside

Two systems for one job, and the confusing question "why is Slack connected
twice?" at every support interaction. Keeps the hosted broker, the vendor apps,
and the network dependency. Rejected: the maintenance is the problem, and this
adds to it.

### Option C — Keep the drivers, drop only the hosted broker

Ship per-user OAuth apps instead of Prism-owned ones. Removes the hosted
service but pushes OAuth app registration onto the user, which is a far worse
first run than "you already have Slack in Cursor". Rejected.

## Consequences

**Good.** About four thousand lines and one hosted service leave the codebase.
Dispatch makes no network calls at all. Connectors become whatever the
developer's org actually uses, with no work from Prism. The privacy story
becomes simple enough to state in one sentence.

**Bad.** `start_my_day` is only as good as the host. A thinner briefing in a
bare editor is a real regression for the small number of users who had
connected Prism Auth.

**Irreversible.** Backing this out is a revert, not a flag. That is why the
replacement ships first and in the same phase.

**Owner actions unblocked.** Retire `auth.prismhq.in`; revoke the six vendor
OAuth apps; drop the `PRISM_AUTH_*` Vercel secrets.

## Compliance

- `packages/dispatch/src/host-connectors.ts` — discovery, read-only, no network.
- `packages/dispatch/src/briefing.ts` — spine plus fill contract.
- `packages/mcp-server/src/prompts.ts` — the `connect` prompt is replaced; it
  used to say "do not fetch Calendar yourself", the exact opposite of this
  model.
- No `@repo-prism/dispatch-auth`, `drivers.ts`, `oauth*.ts`, `broker.ts`,
  `tokens.ts`, `token-refresh.ts`, `connect-ux.ts`, `loopback-page.ts`, or
  `consent.ts` in `packages/dispatch/src/`.
- No `network.*` Dispatch consent purposes in
  `packages/shared/src/consent-purposes.ts`. Core's own network purposes
  (`network.github`, `pagespeed`, `package-install`, `git-remote`, `gravatar`,
  `run.local-build`) are unaffected.
