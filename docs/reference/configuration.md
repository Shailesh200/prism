---
title: Configuration
description: "Ignore rules, environment variables, CLI, MCP, and extension settings."
---

There is very little to configure, which is deliberate. Everything below has a
default that works.

## Ignore rules

The one setting worth attention — it is behind most surprises about speed and
file counts.

Prism combines these sources:

1. A builtin list of directories nobody wants indexed
2. Your `.gitignore`
3. `.prismignore` at the repository root, if present
4. Optional `excludeGlobs` in [`.prism/config.json`](#prismconfigjson)

`.prismignore` uses gitignore syntax and applies on top of the others. Use it
for things that belong in the repository but not in the analysis — generated
clients, vendored code, large fixtures:

```
src/generated/**
fixtures/large/**
```

Defaults already cover `node_modules`, `dist`, `build`, `.next`, `out`,
`coverage`, `.git`, `.turbo`, `.cache`, minified JavaScript and source maps, plus
ecosystem-specific additions once Prism detects the ecosystem.

## `.prism/config.json`

Shared indexing knobs for CLI and IDE (Core reads this at workspace open):

```json
{
  "excludeGlobs": ["vendor/**", "fixtures/large/**"],
  "maxFileBytes": 5242880
}
```

| Field | Effect |
|---|---|
| `excludeGlobs` | Extra gitignore-style patterns |
| `maxFileBytes` | Skip hashing files larger than this; `null` = no limit |

Precedence when indexing: CLI / API flags → `.prism/config.json` → defaults
(5 MiB max file size).

## Environment variables

| Variable | Effect |
|---|---|
| `PRISM_WORKSPACE` | The repository to analyse, when not passed explicitly |
| `NO_COLOR` | Disables ANSI colour in CLI output |
| `COLUMNS` | Terminal width used for wrapping, when it cannot be detected |

## CLI

Most behaviour is flags; indexing also honours [`.prism/config.json`](#prismconfigjson).
See [using the CLI](/docs/cli/usage) for global options and
[the command reference](/docs/reference/cli-commands) for per-command options.

Workspace resolution, most explicit first: `--workspace`, then
`PRISM_WORKSPACE`, then (MCP only) the host `WORKSPACE_FOLDER_PATHS`, then the
nearest ancestor with a `.git`, then the current directory. `prism doctor`
prints which rule won.

## MCP server

Configured by your MCP client, not by Prism. Happy path — no path flags:

```json
{
  "mcpServers": {
    "prism": {
      "command": "npx",
      "args": ["-y", "@repo-prism/mcp-server"]
    }
  }
}
```

Resolution: `--workspace` → `PRISM_WORKSPACE` → host `WORKSPACE_FOLDER_PATHS` →
nearest git root → cwd. Only set `--workspace` / `PRISM_WORKSPACE` when the
client starts the server from the wrong directory and the host folder env is
empty. See [MCP install](/docs/mcp/install).

## Extension settings

See [IDE settings](/docs/ide/settings). One VS Code setting lives in the editor:

| Setting | Default | Effect |
|---|---|---|
| `prism.codeLens.enabled` | `true` | Blast Radius, Ownership and Map lenses above the first line of TS/JS files |

Consent and privacy toggles are documented under
[consent and privacy](/docs/concepts/consent-and-privacy).

## What is stored, and where

Settings that belong to a repository — consent, bookmarks — live in `.prism/`
alongside the index. Presentation settings belong to the client.

## Related

[Troubleshooting](/docs/reference/troubleshooting) · [CLI usage](/docs/cli/usage) ·
[Consent and privacy](/docs/concepts/consent-and-privacy)
