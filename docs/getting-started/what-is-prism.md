# What is Prism

**Prism is a tool that reads your repository and answers questions about it that
no single file can answer.**

## The problem

You join a project, or come back to one after six months. You open the folder
and see four hundred files. Your editor can tell you what any one of them says.
Nothing tells you:

- Which of these files matter, and which are noise
- What happens to the rest of the system if you change this one
- Which parts of this codebase belong together as a feature
- Where the tests are thin and the churn is high at the same time
- What this project is even built with — which framework, which test runner,
  which of the eleven config files are actually load-bearing

You answer these by grepping, guessing, and asking someone who has been there
longer. Prism answers them by reading the whole repository at once.

## What it actually does

Prism parses every source file into a local database, works out how they refer
to each other, and derives a set of views from that:

| View | The question it answers |
|---|---|
| **Repository map** | What is in here, arranged so I can see the shape of it |
| **Dependency graph** | What imports what, and where are the cycles |
| **Repository DNA** | What is this project built out of, and which domains does it span |
| **Health score** | Where is the risk concentrated, and why |
| **Blast radius** | If I change this file, what else is affected |
| **Feature graph** | Which files, together, implement one user-facing thing |
| **Reports** | Engineering health, testing, security posture, backend surface, bundle weight |

All of it comes from one index, so the map and the graph and the score can never
tell you different stories about the same file.

## Where you use it

Prism is one engine behind four surfaces. They all show the same answers.

| Surface | For |
|---|---|
| **VS Code / Cursor extension** | Reading a repository visually, day to day |
| **Command line** | Scripts, CI, and anyone who prefers a terminal |
| **MCP server** | Giving an AI agent real knowledge of your codebase |
| **Playground** | Trying Prism in a browser without installing an extension |

## Is it for you?

**Probably yes if:** you work in a TypeScript or JavaScript codebase large
enough that you cannot hold it in your head, and you want to understand it or
change it safely.

**Probably not if:** your project is small enough to read in an afternoon, or it
is written in a language Prism does not parse. Prism understands
TypeScript and JavaScript. It reads configuration and lockfiles from many
ecosystems, but it does not resolve symbols across languages. See
[known limitations](../reference/known-limitations.md) before you invest.

**Definitely not if** you want something to write code for you. Prism is not an
assistant and has no model behind it.

## What it costs you

Disk: an index proportional to your repository, in `.prism/`. A large monorepo
produces tens of megabytes.

Time: the first index of a few thousand files takes seconds, not minutes.
Afterwards Prism updates incrementally as files change.

Privacy: nothing, by default. No telemetry, no account, no network. The optional
features that do reach out are listed and individually consented in
[consent and privacy](../concepts/consent-and-privacy.md).

## Next

[Install Prism](./install.md), then [run your first analysis](./quickstart.md).
