---
title: Prism Dispatch
description: "Chat-native teammate: start my day, jobs, remember, connect, configure."
---

> Hand a change to a background teammate, then read back what it actually did.

Dispatch is the `@prism` teammate: standup, jobs, and connectors, on the same
`prism` server. Intelligence tools still map the repo.

## Talk in chat

| You say | What happens |
|---|---|
| "start my day" | `start_my_day` — greeting, yesterday, this repo, then the sections your agent fills |
| any request to change code ("fix the news tab highlighting") | the agent asks: teammate, or here? |
| that request plus "do it now" | no job — the agent edits inline |
| "prism init" | `init` — worker sign-in, without starting a job |
| "where are we" | `list_jobs` — live activity, then results or errors |
| "what is it doing" / "show me the logs" | `job_logs` — that job's console |
| "remember …" | `remember` |
| "configure Dispatch" | `configure` — any setting, plus standing wishes as preferences |

## Connectors are your editor’s

Prism runs **no OAuth** and holds **no third-party tokens** (ADR-0049).
Dispatch makes no network calls at all.

Connect Slack, Linear, Jira, Notion, GitHub or Calendar where you already do:
Cursor’s or Claude Code’s own plugin settings. Prism reads those manifests for
names and capabilities, never tokens.

So `start_my_day` returns what only Prism can produce (git, jobs, memories)
plus a **fill contract**: the sections to show, and which of *your* connectors
answers each. Your agent makes those calls with the grant you already gave it.
A section with nothing behind it is named as unfillable, not dropped.

Ask **what is connected** for the list.

## Local workers

`start_job` starts a **local** teammate in **your own checkout** — edits appear
in your tree as it works, uncommitted, like a pair programmer. Ask for “a
separate branch” and it takes a worktree, as does a second concurrent job. The
agent loop runs in a **separate process** so chat
stays responsive, and matches your host: a **Cursor** agent in Cursor, a
**Claude Code** agent (`claude -p`) in Claude Code. `configure` →
`workerBackend` / `placement` overrides. The agent passes
`workspace` itself; never paste a path into mcp.json.

**Who decides.** By default the agent asks: teammate, or here? Guessing wrong
strands a job or edits a tree you were using. `configure` → `dispatchMode`:
`auto` never asks, `inline` dispatches only when you ask.

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

Chat cannot push into an idle session, so
a **jobs board** at `http://prismhq.localhost:17330/` and a desktop notification
report finishes (`PRISM_HUB=0` opts out). In Claude Code, `npx -y
--prefer-online @repo-prism/dispatch-hub@latest statusline --setup` pins it in
the footer.

The first time, **prism init** runs worker sign-in: a **Cursor login page** in
Cursor, a `claude` CLI check in Claude Code. Chat names a job by ticket or
slug, never a hash. **Authenticating prism…** with **Skip** is MCP tool
approval: click it, then retry.

State is gitignored under `.prism/dispatch/`; sign-in stays in the host's store.

## Related

[Usage](/docs/usage) · [Install](/docs/start/install) ·
[Consent](/docs/concepts/consent-and-privacy)
