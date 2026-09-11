---
title: Spectrum
description: "Browser UI for trying Prism without installing an extension."
---

Spectrum is the local browser version of the Prism interface — for trying it
without an extension, and for developing Prism itself. It indexes the
repository selected in Dispatch, not the Prism checkout.

## Running it

From a clone of the repository:

```bash
bun install
bun run --filter '@repo-prism/playground' dev
```

Open the URL it prints. Pick a repository from the same dropdown Dispatch uses,
or pass `?root=` on the URL.

## What it is for

**Trying Prism.** Every screen the extension has, without installing into an
editor.

**Developing Prism.** Spectrum and the extension share
`@repo-prism/app-shell`, so screen work lands in both. Spectrum has a
browser DevTools loop the extension webview lacks.

## Differences from the extension

| | Spectrum | Extension |
|---|---|---|
| Open a file in an editor | No | Yes |
| Workspace | Dispatch-selected repo, `?root=`, or environment | Editor folder |
| Reindex on save | Manual | Automatic |

The analysis is identical: same engine, same answers.

## Not a hosted product

Spectrum is a local app against a local repository. There is no Prism cloud.
See [consent and privacy](/docs/concepts/consent-and-privacy).

## Related

[IDE usage](/docs/usage) · [What is Prism](/docs/what-is-prism)
