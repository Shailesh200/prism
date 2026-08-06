---
title: The repository index
description: "Prism's parsed copy of your repository — every answer derives from it."
---

The index is Prism's parsed copy of your repository. Every other answer is
derived from it, which is why they all agree with each other.

## What it holds

When you run `prism index` — or open a repository in the extension — Prism walks
your files, parses the ones it understands, and records:

| | |
|---|---|
| **Files** | Path, size, language, and a hash of the contents |
| **Symbols** | Functions, classes, types, and exports, with where they are defined |
| **Imports** | Which file refers to which, and how |
| **Roles** | Whether a file looks like a test, a config, a type declaration, or source |

It does not store your source code. It stores facts *about* your source code.
The result lives in `.prism/cache/index.sqlite`.

## Why one index matters

If two features each read the repository their own way, they will eventually
disagree. One index means one answer. When the map and impact analysis disagree,
it is a bug in one derivation — not two opinions.

## Incremental updates

Re-indexing an unchanged repository does almost nothing. Prism hashes each file
and re-parses only what changed. In the editor this happens as you save; from
the CLI each command reuses the index and refreshes what is stale.

## What gets skipped

Prism skips files over the size limit, exclude patterns (`node_modules`, `dist`,
…), and files it cannot parse. Skips are reported, not hidden. If `prism index`
reports many skipped files, check excludes before trusting results.

## What it is not

Not a search engine. It holds structure, not content: it can tell you that
`cart.ts` exports `total` and four files import it, not which lines mention the
word "total".

## Related

[Graphs](/docs/concepts/graphs) · [Signal provenance](/docs/concepts/signal-provenance)
