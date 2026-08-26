---
title: Prism Dispatch
description: "Chat-native teammate on the prism MCP server: start my day, jobs, remember, connect, configure."
---

Dispatch is the `@prism` teammate. Intelligence tools still map the repo;
Dispatch runs standup, jobs, and optional connectors. Same server name `prism`.

## Talk in chat

| You say | What happens |
|---|---|
| "start my day" | `start_my_day` — greeting, yesterday (git + finished work), then open Linear/GitHub/Slack items |
| "start working on AI-971" + a PRD | `start_job` — a teammate starts in its own worktree; say “where are we” for live status and the result |
| "prism init" | `init` — same Cursor login page, without starting a job |
| "where are we" | `list_jobs` — live activity, then finished results or errors |
| "remember …" | `remember` |
| "connect Slack" | `integrations` — Cursor: Authenticate button; Claude: Prism Auth page |
| "configure Dispatch" | `configure` — standup layout, Slack channels, Linear vs Jira, job cap |

No connector is on by default. Slack v1 is a **private workspace app** (not App
Directory): mentions plus a few tracked channels or groups. It does not post.
Google Calendar is read-only, today only.

Google may show **Google hasn’t verified this app** even when Google Cloud
**Branding status** is verified. Branding is not the same as **app
verification** for Calendar (`calendar.readonly` is a sensitive scope). Click
**Advanced**, then continue. Clearing that screen for every Google account is
Prism’s job (submit Calendar scopes on the Prism Auth GCP project), not yours.

## Connect (Prism Auth)

Say **connect Google Calendar** (or Slack, GitHub, Linear, Jira, Notion).

In **Cursor**, Prism shows a short step list and the native **Authenticate**
button. Clicking Authenticate opens [Prism Auth](https://auth.prismhq.in) and
the vendor login (Google, etc.). In **Claude**, the auth page opens directly.
You grant access at the vendor. You do **not** create an OAuth app or paste a
client id. If the agent cannot call `integrations`, reload the **prism** MCP
server and say connect again — do not search the repo.

Prism's broker holds the vendor app secrets. Your access token comes back to
the local MCP and is stored in the OS keychain. Completing that grant is the
consent decision (see [privacy](/docs/concepts/consent-and-privacy)).

Google Calendar access tokens last about an hour. Dispatch asks Prism Auth
(`/oauth/refresh`) to mint a new one with the stored refresh token — the MCP
never has Google’s client secret. If start-my-day still says Calendar access
expired, say **connect Google Calendar** again (revoked grant, or no refresh
token from the first login).

A connector that is not enabled on Prism Auth yet will say so — that is Prism's
job to register, not yours.

## Local workers

`start_job` starts a **local** Cursor teammate **in its own git worktree**
(adopt a matching Cursor/Claude tree, or create `.prism/dispatch/worktrees/<id>`).
The agent loop runs in a **separate Node process**, not inside the prism MCP
server, so chat stays responsive. Default cap is **one job at a time**
(`configure` can raise `maxJobs` once the machine can take it). Prism job
worktrees **symlink** the host `node_modules` — teammates must not `bun install`.
Job agents do **not** get Prism MCP (no second index) and have **no shell**
(they cannot run `prism` or `bun install`). Repo-wide “find issues / audit”
is host `repository_health`, not a Dispatch job.

The first time, a **Cursor login page** opens in the browser. Say **prism init**
to do that sign-in without starting a job. Chat names the job with a ticket
(`AI-971`) or a title slug (`audit-issues`) — never a `job-<hex>` hash. Pause
with “pause audit-issues”.

**Live status and results live in chat.** Say **where are we** anytime: you
see what each teammate is doing, and when it finishes you get what changed (or
a real error if it failed). Start my day also lists jobs that just finished.
MCP cannot push a line into an idle chat — “where are we” is how the result
comes back.

Open Cursor’s **Agents window** (Filter → Source → SDK) if you want the IDE
list; it is optional and often empty for local workers. The guaranteed view is
chat.

If Cursor shows a card titled **Authenticating prism…** with **Skip**, that is
Cursor approving MCP tools — not worker login. Click **Skip**, then retry.

Workers cannot start more jobs or OAuth. They do not get Prism MCP — host
chat still uses `blast_radius` before risky edits. `node_modules` in a Prism
job worktree is a symlink to the host install so a job cannot fill the disk
with a second copy of the repo’s packages.

State is gitignored under `.prism/dispatch/` (jobs plus `runs/<id>.json` live
sidecars). Vendor tokens go in the OS keychain. Worker sign-in stays in the
Cursor SDK login store on this machine.

## Related

[Usage](/docs/mcp/usage) · [Install](/docs/mcp/install) ·
[Consent](/docs/concepts/consent-and-privacy)
