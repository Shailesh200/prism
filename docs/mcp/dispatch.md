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
| any request to change code ("fix the news tab highlighting") | `start_job` — a teammate starts in its own worktree; say “where are we” for status and the result |
| that request plus "do it now" / "right here" | no job — the agent edits inline |
| "prism init" | `init` — same Cursor login page, without starting a job |
| "where are we" | `list_jobs` — live activity, then finished results or errors |
| "what is it doing" / "show me the logs" | `job_logs` — that job's console, plus the uncommitted review |
| "remember …" | `remember` |
| "connect Slack" | `integrations` — Cursor: Authenticate button; Claude: Prism Auth page |
| "configure Dispatch" | `configure` — standup layout, Slack channels, Linear vs Jira, job cap |

No connector is on by default. Slack v1 is a **private workspace app** (not App
Directory): mentions plus a few tracked channels or groups. It does not post.
Google Calendar is read-only, today only.

Google may show **Google hasn’t verified this app** even when Google Cloud
**Branding status** is verified. Branding is not app **verification** for
Calendar (`calendar.readonly` is a sensitive scope). Click **Advanced**, then
continue. Clearing that screen for every account is Prism’s job, not yours.

## Nothing is committed for you

A teammate never commits, stages, branches, or pushes — it has no shell. When a
job finishes it reports **ready for your review** with the changed files and
`+`/`-` counts still sitting uncommitted in its worktree, and chat asks whether
to commit, keep, or discard. Read the diff before you decide.

A job that goes quiet says **no activity for N minutes** instead of claiming to
run: a live process is not the same as progress. Call `job_logs` to see the last
thing it actually did, then resume or cancel.

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

Google Calendar tokens last about an hour; Dispatch refreshes them through
Prism Auth, so the MCP never holds Google’s client secret. If Calendar still
reads as expired, say **connect Google Calendar** again. A connector Prism has
not registered yet will say so.

## Local workers

`start_job` starts a **local** Cursor teammate **in its own git worktree**
(adopt a matching Cursor/Claude tree, or create `.prism/dispatch/worktrees/<id>`).
The open folder must be a git repository. If a job says Prism cannot see a git
repo, retry with that project open — the agent passes `workspace` itself. Do
not paste a path into mcp.json. The agent loop runs in a **separate Node
process**, not inside the prism MCP server, so chat stays responsive. Default cap is **one job at a time**
(`configure` can raise `maxJobs` once the machine can take it). Prism job
worktrees **symlink** the host `node_modules` — teammates must not `bun install`.
Job agents do **not** get Prism MCP (no second index) and have **no shell**
(they cannot run `prism` or `bun install`). Repo-wide “find issues / audit”
is host `repository_health`, not a Dispatch job.

The first time, a **Cursor login page** opens in the browser; say **prism init**
to sign in without starting a job. Chat names the job with a ticket (`AI-971`)
or a slug (`audit-issues`) — never a `job-<hex>` hash. Pause with “pause
audit-issues”.

**Live status and results live in chat.** Say **where are we** anytime, or
**show me the logs** for the console. MCP cannot push a line into an idle chat,
so asking is how a result comes back. Cursor’s **Agents window** (Filter →
Source → SDK) is optional and often empty for local workers.

If Cursor shows a card titled **Authenticating prism…** with **Skip**, that is
Cursor approving MCP tools — not worker login. Click **Skip**, then retry.

Workers cannot start more jobs or OAuth, and host chat still uses
`blast_radius` before risky edits.

State is gitignored under `.prism/dispatch/` (jobs plus `runs/<id>.json` live
sidecars). Vendor tokens go in the OS keychain. Worker sign-in stays in the
Cursor SDK login store on this machine.

## Related

[Usage](/docs/mcp/usage) · [Install](/docs/mcp/install) ·
[Consent](/docs/concepts/consent-and-privacy)
