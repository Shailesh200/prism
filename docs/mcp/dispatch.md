---
title: Prism Dispatch
description: "Chat-native teammate on the prism MCP server: start my day, jobs, remember, connect, configure."
---

Dispatch is the `@prism` teammate: standup, jobs, and optional connectors, on
the same `prism` server. Intelligence tools still map the repo.

## Talk in chat

| You say | What happens |
|---|---|
| "start my day" | `start_my_day` — greeting, yesterday, then open Linear/GitHub/Slack |
| any request to change code ("fix the news tab highlighting") | `start_job` — no trigger phrase; the agent says what it is starting first |
| that request plus "do it now" | no job — the agent edits inline |
| "prism init" | `init` — the Cursor login page, without starting a job |
| "where are we" | `list_jobs` — live activity, then results or errors |
| "what is it doing" / "show me the logs" | `job_logs` — that job's console |
| "remember …" | `remember` |
| "connect Slack" | `integrations` — Cursor: Authenticate button; Claude: Prism Auth page |
| "configure Dispatch" | `configure` — standup layout, Slack channels, job cap |

No connector is on by default. Slack v1 is a **private workspace app** (not App
Directory): mentions plus a few tracked channels, and it does not post. Google
Calendar is read-only.

## Connect (Prism Auth)

Say **connect Google Calendar** (or Slack, GitHub, Linear, Jira, Notion).
In **Cursor**, Prism shows a step list and the native **Authenticate** button,
which opens [Prism Auth](https://auth.prismhq.in) and the vendor login; in
**Claude**, the auth page opens directly. You never create an OAuth app or
paste a client id. Prism's broker holds the vendor secrets; your token lives in
the OS keychain, and that grant is the consent decision (see
[privacy](/docs/concepts/consent-and-privacy)).

Google may warn **Google hasn’t verified this app** even when Cloud
**Branding status** is verified — branding is not app verification for
Calendar’s sensitive scope. Click **Advanced**, then continue.

## Local workers

`start_job` starts a **local** Cursor teammate **in its own git worktree**,
with the agent loop in a **separate Node process** so chat stays responsive.
The agent passes `workspace` itself; do not paste a path into mcp.json.

Job agents get **no shell** and **no Prism MCP** (no second index), and their
worktrees **symlink** the host `node_modules`. Multi-part work splits into
**subagents inside that process**. Repo-wide audits are `repository_health`.
Jobs are admitted on **free memory** (`configure` sets `maxJobs`).

### How work comes back

When a teammate stops, **Prism** commits its work to the job branch and runs
`typecheck` and tests — the teammate never does this itself, so what you read
is a real commit with a real pass/fail. A run that changed nothing says
**“produced no reviewable change”** rather than dressing an empty branch up as
success. Write-ups belong in `.prism/dispatch/notes/`, the one path under
`.prism/` that ships with the commit; anything else there is lost on prune.

Summaries are checked against the branch, so a teammate cannot claim a file it
never wrote. Worktrees whose job is gone are pruned unless they hold unmerged
commits.

**Finishing is not landing.** That commit sits on the job's own branch, so a
job returns **ready for your review** — files, `+`/`-`, and a question — and
Prism never merges or pushes it for you. A quiet job says **no activity for N
minutes** instead of claiming to run; `job_logs` gives its console.

Say **where are we** for live activity. MCP cannot push into an idle chat, so a
**jobs board** at `http://127.0.0.1:17330/` (Prism → Open Agent Dashboard) plus
a desktop notification reports when a teammate finishes (`PRISM_HUB=0` disables
it).

The first time, a **Cursor login page** opens; say **prism init** to sign in
without starting a job. Chat names a job by ticket (`AI-971`) or slug
(`audit-issues`), never a `job-<hex>` hash. If Cursor shows **Authenticating
prism…** with **Skip**, that is MCP tool approval: click it, then retry.

State is gitignored under `.prism/dispatch/`; worker sign-in stays in the
Cursor SDK login store.

## Related

[Usage](/docs/mcp/usage) · [Install](/docs/mcp/install) ·
[Consent](/docs/concepts/consent-and-privacy)
