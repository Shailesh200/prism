---
title: Prism Dispatch
description: "Chat-native teammate: start my day, jobs, remember, connect, configure."
---

Dispatch is the `@prism` teammate: standup, jobs, and optional connectors, on
the same `prism` server. Intelligence tools still map the repo.

## Talk in chat

| You say | What happens |
|---|---|
| "start my day" | `start_my_day` — greeting, yesterday, then open Linear/GitHub/Slack |
| any request to change code ("fix the news tab highlighting") | the agent asks: teammate, or here? |
| that request plus "do it now" | no job — the agent edits inline |
| "prism init" | `init` — worker sign-in, without starting a job |
| "where are we" | `list_jobs` — live activity, then results or errors |
| "what is it doing" / "show me the logs" | `job_logs` — that job's console |
| "remember …" | `remember` |
| "connect Slack" | `integrations` — Cursor: Authenticate button; Claude: Prism Auth page |
| "configure Dispatch" | `configure` — any setting, plus standing wishes as preferences |

No connector is on by default. Slack v1 is a **private workspace app**:
mentions plus a few tracked channels; it does not post. Calendar is read-only.

## Connect (Prism Auth)

Say **connect Google Calendar** (or Slack, GitHub, Linear, Jira, Notion).
In **Cursor**, the native **Authenticate** button opens
[Prism Auth](https://auth.prismhq.in); in **Claude**, the auth page opens
directly. You never create an OAuth app or paste a client id.
The broker holds the vendor secrets; your token lives in the OS keychain, and
the grant is the consent decision (see
[privacy](/docs/concepts/consent-and-privacy)). Google’s **hasn’t verified this
app** warning is expected — branding is not scope verification. Click
**Advanced**, then continue.

## Local workers

`start_job` starts a **local** teammate in **your own checkout** — edits appear
in your tree as it works, uncommitted, like a pair programmer. Ask for “a
separate branch” and it takes a worktree, as does a second concurrent job. The
agent loop runs in a **separate process** so chat
stays responsive, and matches your host: a **Cursor** agent in Cursor, a
**Claude Code** agent (`claude -p`, signed in once in a terminal) in Claude
Code. `configure` → `workerBackend` / `placement` overrides. The agent passes
`workspace` itself; never paste a path into mcp.json.

**Pause** freezes the teammate in place — it keeps its process and session.
**Resume** continues from there. A dirty checkout asks before a job starts,
and again before resume if new uncommitted files appeared while it was away.

**Who decides.** By default the agent asks: teammate, or here? Guessing wrong
strands a job or edits a tree you were using. `configure` → `dispatchMode`:
`auto` never asks, `inline` dispatches only when you ask. Those settings live
in `~/.prism` and apply to every repository and every MCP host on the machine
(Cursor, Claude Code, Codex, Claude Desktop). `workerBackend: auto` still
matches the host that started the job; pin `cursor` or `claude` to use the
same worker CLI everywhere.

Job agents get **no shell** and **no Prism MCP** (no second index); worktrees
**symlink** the host `node_modules`. Multi-part work splits into **in-process
subagents**. Audits are `repository_health`. Admission is on **free memory**.

### How work comes back

When a teammate stops, **Prism** runs `typecheck` and tests — the teammate
never does this itself, so what you read carries a real pass/fail. A checkout
job's edits stay **uncommitted in your tree**; the review lists only what the
job touched, and **“commit it”** commits just those files. A worktree job gets
a commit on its own branch — Prism never merges or pushes either way. A run
that changed nothing says **“produced no reviewable change”**. Write-ups belong
in `.prism/dispatch/notes/`, the one `.prism/` path a commit includes.

Summaries are checked against the tree, so a teammate cannot claim a file it
never wrote. A quiet job says **no activity for N minutes**; `job_logs` gives
its console.

Say **where are we** for live activity. Chat cannot push into an idle session,
so a **jobs board** at `http://127.0.0.1:17330/` and a desktop notification
report a finish (`PRISM_HUB=0` opts out). In Claude Code, `prism-hub
statusline` pins it in the footer.

The first time, **prism init** runs worker sign-in: a **Cursor login page** in
Cursor, a `claude` CLI check in Claude Code. Chat names a job by ticket or
slug, never a hash. **Authenticating prism…** with **Skip** is MCP tool
approval: click it, then retry.

State is gitignored under `.prism/dispatch/`; sign-in stays in the host's store.

## Related

[Usage](/docs/mcp/usage) · [Install](/docs/mcp/install) ·
[Consent](/docs/concepts/consent-and-privacy)
