---
title: Prism Dispatch
description: "Chat-native teammate on the prism MCP server: start my day, jobs, remember, connect, configure."
---

Dispatch is the `@prism` teammate. Intelligence tools still map the repo;
Dispatch runs standup, jobs, and optional connectors. Same server name `prism`.

## Talk in chat

| You say | What happens |
|---|---|
| "start my day" | `start_my_day` — leftover jobs, git, then connected tools, then connect CTAs |
| "start working on AI-971" + a PRD | `start_job` — adopt a Cursor/Claude worktree if one matches, else create one |
| "where are we" | `list_jobs` |
| "remember …" | `remember` |
| "connect Slack" | `integrations` — Cursor: Authenticate button; Claude: Prism Auth page |
| "configure Dispatch" | `configure` — standup layout, Slack channels, Linear vs Jira, job cap |

No connector is on by default. Slack v1 is a **private workspace app** (not App
Directory): mentions plus a few tracked channels or groups. It does not post.
Google Calendar is read-only, today only.

## Connect (Prism Auth)

Say **connect Google Calendar** (or Slack, GitHub, Linear, Jira, Notion).

In **Cursor**, Prism shows a short step list and the native **Authenticate**
button. That opens [Prism Auth](https://auth.prismhq.in). In **Claude**, the
auth page opens directly. You grant access at the vendor. You do **not**
create an OAuth app or paste a client id.

Prism's broker holds the vendor app secrets. Your access token comes back to
the local MCP and is stored in the OS keychain. Completing that grant is the
consent decision (see [privacy](/docs/concepts/consent-and-privacy)).

A connector that is not enabled on Prism Auth yet will say so — that is Prism's
job to register, not yours.

`CURSOR_API_KEY` is only required to spawn local job workers. Connect, briefing,
and remember work without it.

## Local workers

`start_job` starts a **local** Cursor SDK agent in the job worktree
(`CURSOR_API_KEY` required). The call returns the job id immediately. Workers
get Prism MCP with `PRISM_DISPATCH_ROLE=worker` so they cannot start more jobs
or OAuth. They should still call `blast_radius` before risky edits.

State is gitignored under `.prism/dispatch/`. User tokens go in the OS keychain.

## Related

[Usage](/docs/mcp/usage) · [Install](/docs/mcp/install) ·
[Consent](/docs/concepts/consent-and-privacy)
