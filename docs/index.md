# Prism

Prism reads a codebase and tells you what is in it.

Not "what does this function do" — an editor already shows you that. Prism
answers the questions you cannot answer by reading one file: what breaks if I
change this, which parts of this repository belong together, where is the risk
concentrated, what is this project even built out of.

It runs entirely on your machine. Nothing is uploaded. There is no account.

## Start here

| If you want to | Read |
|---|---|
| Know whether this is for you | [What is Prism](./getting-started/what-is-prism.md) |
| Get it running | [Install](./getting-started/install.md) then [Quickstart](./getting-started/quickstart.md) |
| Understand what the numbers mean | [Concepts](./concepts/repository-index.md) |
| Use it from a terminal | [CLI](./using/cli.md) · [Command reference](./reference/cli-commands.md) |
| Give an AI agent access to it | [MCP](./using/mcp.md) · [Tool reference](./reference/mcp-tools.md) |
| Change the code | [Architecture](./architecture/overview.md) · [Contributing](https://github.com/Shailesh200/prism/blob/main/CONTRIBUTING.md) |
| Know what it cannot do | [Known limitations](./reference/known-limitations.md) |

## The three ideas

Everything else in Prism follows from these.

**One index, many answers.** Prism parses your repository once into a local
index, then derives every report from that. The map, the dependency graph, the
health score and the blast radius are all views of the same data, so they cannot
disagree with each other.

**Say "I don't know" out loud.** Prism distinguishes a measured number from an
estimated one, and shows nothing rather than inventing a plausible figure. See
[signal provenance](./concepts/signal-provenance.md).

**Local by default, always.** Analysis never touches the network. The handful of
optional features that do are individually consented, and there is a test that
fails the build if anything else tries. See
[consent and privacy](./concepts/consent-and-privacy.md).

## What Prism is not

It is not an AI coding assistant. It does not write code, review your pull
requests, or call a language model. It is the layer *underneath* those tools:
the thing that knows what your repository actually contains, which an assistant
can then use.

## Reading these docs

Every page opens with a plain answer to "what is this and why do I care". Terms
specific to Prism are defined the first time they appear and collected in the
[glossary](./reference/glossary.md).

These docs describe the product. The engineering record — milestone plans,
architecture decisions, verification procedure — lives in `plans/` and is
written for someone building Prism rather than using it.
