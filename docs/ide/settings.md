---
title: IDE settings
description: "Indexing, appearance, CodeLens, and privacy toggles in the extension."
---

## Worth setting early

| Setting | Why |
|---|---|
| **Exclude globs** | Slow indexing or wrong file counts usually start here |
| **Max file size** | Skip generated bundles and vendored code |
| **Auto re-index** | On by default; interval is adjustable |
| **Privacy** | Every optional network feature, individually |

## VS Code setting

| Setting | Default | Effect |
|---|---|---|
| `prism.codeLens.enabled` | `true` | Blast Radius, Ownership and Map lenses above the first line of TS/JS files |

Everything else lives in Prism's Settings screen.

### Indexing

| Setting | Default | Notes |
|---|---|---|
| **Exclude globs** | Builtin + `.gitignore` + `.prismignore` | Newline-separated gitignore syntax |
| **Max file size** | 5 MB | Options from 256 KB to no limit |
| **Auto re-index** | On | As files change (watch starts on activation, panel not required) |
| **Auto re-index interval** | 15 minutes | 5 minutes to 6 hours |

### Appearance

Theme, density, fonts — presentation only; nothing here changes analysis.

### Privacy

Every optional network capability, individually. Off by default. See
[consent and privacy](/docs/concepts/consent-and-privacy).

Repository-bound settings (consent, bookmarks) live in `.prism/`. Presentation
settings live in the client.

## Related

[Configuration](/docs/reference/configuration) · [IDE usage](/docs/ide/usage)
