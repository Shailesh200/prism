---
title: Install
description: "Choose a surface — CLI, IDE extension, or AI agent MCP — then follow that lane."
---

Prefer the guided path? Use the
[**Get started** wizard](/docs/start/get-started).

Pick the surface you want. They share one engine and agree with each other. You
can install more than one.

## Requirements (everyone)

1. **Node.js 26** or newer (`node -v` should show `v26…`).
2. A **project repository** open (TypeScript / JavaScript; git optional but
   recommended).
3. You do **not** need to clone the Prism GitHub repo to use published packages.

## Choose a surface

| Surface | Guide |
|---|---|
| **Command line** (`prism`) | [CLI install](/docs/cli/install) |
| **VS Code / Cursor** (RepoPrism) | [IDE install](/docs/ide/install) |
| **AI agents** (MCP) | [MCP install](/docs/mcp/install) |

After install, run [Quickstart](/docs/start/quickstart) or jump to a
[task guide](/docs/guides/understand-a-repo).

## What Prism writes in your project

After the first analysis:

```
your-repo/
  .prism/
    cache/           index + health history
    consent.json     optional network feature decisions
    bookmarks.json   map bookmarks
    ingest/          artifacts you asked Prism to read
    tools/           tools you consented to install
```

Let Prism add `.prism/` to `.gitignore` when offered — it is derived output.

## From source (contributors)

```bash
git clone https://github.com/Shailesh200/prism
cd prism
bun install
bun run verify:milestone
```

See [CONTRIBUTING](https://github.com/Shailesh200/prism/blob/main/CONTRIBUTING.md).
