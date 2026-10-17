---
title: What is Prism
description: "A local tool that answers repository questions no single file can."
---

**Prism reads your repository and answers questions that no single file can
answer.**

## The problem

You join a project, or come back after six months. Your editor shows what any
one file says. Nothing tells you which files matter, what a change breaks, which
parts belong together as a feature, where tests are thin and churn is high, or
what the project is actually built with.

## What it does

Prism parses source into a local index and derives views from that one store:

| View | Question |
|---|---|
| **Dependency / knowledge / feature graphs** | What imports what, what symbols mean, which files implement one capability? |
| **Repository DNA** | What is this built from, and which domains does it span? |
| **Blast radius** | If I change this file, what else is affected? |
| **Prepare** | What should I open for this task, and what already exists? |
| **Review** | Of everything this session changed, what should I read first? |
| **Lens review** | Which callers did the change leave behind, and what has no test? |
| **Findings** | What unused or duplicated code is worth fixing? |
| **Receipt** | Which checks did this change reach, and did they pass? |

## Where you use it

| Surface | For |
|---|---|
| **MCP server and hooks** | Claude Code, Cursor, Codex and opencode: nine tools, a prompt-time pack and a stop-time receipt |
| **CLI** | Scripts, CI, terminal workflows |

## Is it for you?

**Probably yes** if you work in a codebase too large to hold in your head.

**Probably not** if the project is small enough to read in an afternoon, or is
written in a language Prism does not analyse yet. See
[known limitations](/docs/help/known-limitations).

Prism writes no code, and its analysis uses no model. Your agent makes the
edit, in your chat. Before the edit,
[Prepare](/docs/guides/prepare-a-change) returns the files to open, never the
file bodies. When the agent stops, the receipt runs the checks the change
reaches and gives a verdict: SHIP, NOT PROVEN or NO-SHIP.

## Cost

Disk: an index under `~/.prism/workspaces/` (tens of megabytes on a large
monorepo). Time:
seconds for the first index of a few thousand files, then incremental. Privacy:
nothing leaves your machine. See [privacy](/privacy).

## Next

[Install](/docs/start/install) · [Quickstart](/docs/start/quickstart) ·
[Understand a repo](/docs/guides/understand-a-repo)
