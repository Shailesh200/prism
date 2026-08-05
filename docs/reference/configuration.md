# Configuration

**There is very little to configure, which is deliberate. Everything below has a
default that works.**

## Ignore rules

The one setting worth attention, because it is behind most surprises about
speed and file counts.

Prism combines three sources:

1. A builtin list of directories nobody wants indexed
2. Your `.gitignore`
3. `.prismignore` at the repository root, if present

`.prismignore` uses gitignore syntax and applies on top of the others. Use it
for things that belong in the repository but not in the analysis — generated
clients, vendored code, large fixtures:

```
src/generated/**
fixtures/large/**
```

Defaults already cover `node_modules`, `dist`, `build`, `.next`, `out`,
`coverage`, `.git`, `.turbo`, `.cache`, minified JavaScript and source maps, plus
a few ecosystem-specific additions once Prism detects the ecosystem —
`__pycache__` and `.venv` for Python, `target` for Rust, `vendor` for Go.

## Environment variables

| Variable | Effect |
|---|---|
| `PRISM_WORKSPACE` | The repository to analyse, when not passed explicitly |
| `NO_COLOR` | Disables ANSI colour in CLI output |
| `COLUMNS` | Terminal width used for wrapping, when it cannot be detected |

## CLI

Everything is a flag; there is no configuration file. See
[using the CLI](../using/cli.md) for the global options and
[the command reference](./cli-commands.md) for per-command options.

Workspace resolution, most explicit first: `--workspace`, then
`PRISM_WORKSPACE`, then the nearest ancestor with a `.git`, then the current
directory. `prism doctor` prints which rule won.

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

Resolution matches the CLI: `--workspace` → `PRISM_WORKSPACE` → nearest git
root from the process cwd → cwd. Only set `--workspace` / `PRISM_WORKSPACE` when
the client starts the server from the wrong directory.

## Extension settings

One setting lives in VS Code's own settings, because it affects the editor
rather than the analysis:

| Setting | Default | Effect |
|---|---|---|
| `prism.codeLens.enabled` | `false` | Show Blast Radius, Ownership and Map lenses above the first line of each file |

Everything else is in Prism's own Settings screen.

### Indexing

| Setting | Default | Notes |
|---|---|---|
| **Exclude globs** | The defaults above | Newline-separated, gitignore syntax |
| **Max file size** | 1 MB | Files above this are skipped. Options run from 256 KB to no limit |
| **Auto re-index** | On | Reindex as files change |
| **Auto re-index interval** | 15 minutes | The debounce window, from 5 minutes to 6 hours |

Raising the size limit to "none" on a repository with generated bundles is the
fastest way to make indexing slow.

### Appearance

Theme (light, dark, or follow the system), density (comfortable or compact), and
the sans and monospace font families. Presentation only; nothing here changes an
analysis.

### Privacy

Every optional network capability, individually. Off by default, and each one
names what it does and where it goes. See
[consent and privacy](../concepts/consent-and-privacy.md).

Two settings on this screen are not toggles so much as statements: local-only
analysis, and telemetry, which is off and has nowhere to send anything.

## What is stored, and where

Settings that belong to a repository — your consent decisions, bookmarks — live
in `.prism/` alongside the index. Presentation settings belong to the client and
live in its own storage.

Consent lives with the repository rather than with the editor on purpose: the
answer to "may Prism call GitHub about this code" is a property of the code, not
of the machine you happen to be sitting at.

## Related

[Troubleshooting](./troubleshooting.md) · [Using the CLI](../using/cli.md) · [Consent and privacy](../concepts/consent-and-privacy.md)
