---
title: Playground
description: "Browser UI for trying Prism without installing an extension."
---

A local browser version of the Prism interface — for trying it without an
extension, and for developing Prism itself.

## Running it

From a clone of the repository:

```bash
bun install
bun run --filter '@repo-prism/playground' dev
```

Open the URL it prints. Point it at a repository with the root input, or start
with `PRISM_WORKSPACE` set.

## What it is for

**Trying Prism.** Every screen the extension has, without installing into an
editor.

**Developing Prism.** The playground and the extension share
`@repo-prism/app-shell`, so screen work lands in both. The playground has a
browser DevTools loop the extension webview lacks.

## Differences from the extension

| | Playground | Extension |
|---|---|---|
| Open a file in an editor | No | Yes |
| Workspace | Input or environment | Editor folder |
| Reindex on save | Manual | Automatic |

The analysis is identical: same engine, same answers.

## Not a hosted product

The playground is a local dev server against a local repository. There is no
Prism cloud. See [consent and privacy](/docs/concepts/consent-and-privacy).

## Related

[IDE usage](/docs/usage) · [What is Prism](/docs/what-is-prism)
