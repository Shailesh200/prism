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
| **Repository map** | What is in here, and how is it shaped? |
| **Dependency / knowledge / feature graphs** | What imports what, what symbols mean, which files implement one capability? |
| **Repository DNA** | What is this built from, and which domains does it span? |
| **Health score** | Where is risk concentrated, and why? |
| **Blast radius** | If I change this file, what else is affected? |

## Where you use it

| Surface | For |
|---|---|
| **VS Code / Cursor** | Day-to-day visual reading |
| **CLI** | Scripts, CI, terminal workflows |
| **MCP server** | Giving an AI agent real structural knowledge |
| **Playground** | Trying Prism in a browser without an extension |

## Is it for you?

**Probably yes** if you work in a TypeScript or JavaScript codebase too large to
hold in your head.

**Probably not** if the project is small enough to read in an afternoon, or is
written in a language Prism does not parse deeply. See
[known limitations](/docs/help/known-limitations).

Prism itself never writes code — the analysis has no model behind it. When you
do want a change made, [Dispatch](/docs/guides/dispatch) hands it to your editor's
own agent (Cursor or Claude Code, under your sign-in) and Prism runs the
checks afterwards.

## Cost

Disk: an index in `.prism/` (tens of megabytes on a large monorepo). Time:
seconds for the first index of a few thousand files, then incremental. Privacy:
nothing by default — see [consent and privacy](/docs/concepts/consent-and-privacy).

## Next

[Install](/docs/start/install) · [Quickstart](/docs/start/quickstart) ·
[Understand a repo](/docs/guides/understand-a-repo)
