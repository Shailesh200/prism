---
title: Install MCP
description: "Connect Prism to Claude Code, Cursor, Claude Desktop, or Codex."
---

Set Prism up once. After that, talk to the agent in plain language — you never
type tool names.

**Needs:** Node.js 26+, and your project open (or `cd`'d into). Workspace
resolves automatically: `--workspace` → `PRISM_WORKSPACE` → the folder the
client reports as MCP roots (the repo you are chatting in) → host
`WORKSPACE_FOLDER_PATHS` → nearest git root → cwd.

## One-click install

### Cursor

[Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=prism&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi0tcHJlZmVyLW9ubGluZSIsIkByZXBvLXByaXNtL21jcC1zZXJ2ZXJAbGF0ZXN0Il0sImVudiI6eyJOT0RFX1VTRV9TWVNURU1fQ0EiOiIxIn19)

Click the link (or open it from [/benchmarks](/benchmarks)) → approve in Cursor →
**Settings → MCP** → enable **prism** (~40 tools).

### Copy-paste config

Project (`.cursor/mcp.json`) or global (`~/.cursor/mcp.json` / Claude Desktop):

```json
{
  "mcpServers": {
    "prism": {
      "command": "npx",
      "args": ["-y", "--prefer-online", "@repo-prism/mcp-server@latest"],
      "env": {
        "NODE_USE_SYSTEM_CA": "1"
      }
    }
  }
}
```

Canonical copy: [`packages/mcp-server/mcp-install.json`](https://github.com/Shailesh200/prism/blob/main/packages/mcp-server/mcp-install.json)

`@latest` plus `--prefer-online` is the default. **npx does not always pick up a new publish.** The `_npx` cache is keyed by the specifier string: `@latest` reuses the tree already installed for that tag. npm 10 only reinstalls when the packument’s resolved tarball URL changes. Corporate HTTP caches often keep `GET /@repo-prism/mcp-server` (the dist-tag) on an old version while a newer tarball is already live — so reload still runs the old server. Pinning `@1.1.5` is a different cache key and hits the version URL, which is why an absolute version worked.

After a publish, either pin the new version once:

```json
"args": ["-y", "--prefer-online", "@repo-prism/mcp-server@1.1.5"]
```

or delete `~/.npm/_npx` (Windows: `%LocalAppData%\npm-cache\_npx`) and **fully quit Cursor** (not only Reload MCP). Confirm in MCP logs: `prism-mcp 1.1.5: workspace …`.

## Claude Code

```bash
cd /path/to/your/project
claude mcp add prism -- npx -y --prefer-online @repo-prism/mcp-server@latest
```

Restart Claude Code if it was already open. Ask: "What is this repository?"

## Cursor (manual)

If the deeplink above does not work, create `.cursor/mcp.json` at the project root (or `~/.cursor/mcp.json` for every
project):

```json
{
  "mcpServers": {
    "prism": {
      "command": "npx",
      "args": ["-y", "--prefer-online", "@repo-prism/mcp-server@latest"],
      "env": {
        "NODE_USE_SYSTEM_CA": "1"
      }
    }
  }
}
```

**Settings → MCP** → enable **prism** → wait for ~40 tools. No `--workspace` —
chatting in a git project is enough. Prism asks Cursor for the open folder
(`roots/list`) after connect. Set `PRISM_WORKSPACE` only if that still
points at the wrong tree.

## Claude Desktop

Edit the config file (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`; Windows:
`%APPDATA%\Claude\claude_desktop_config.json`) with the same `mcpServers.prism`
block as Cursor. Quit and reopen. If the client always starts MCP from a fixed
directory, add `"env": { "PRISM_WORKSPACE": "/absolute/path/to/project" }`.

## Codex CLI

In `~/.codex/config.toml`:

```toml
[mcp_servers.prism]
command = "npx"
args = ["-y", "--prefer-online", "@repo-prism/mcp-server@latest"]
```

Run Codex from inside your project directory.

## Do not

Run `prism-mcp` in a bare terminal and leave it on `ready on stdio` — that means
it is waiting for a client. Configure the client; the client starts the process.

## Next

[Usage](/docs/mcp/usage) · [Dispatch](/docs/mcp/dispatch) · [Prompts](/docs/mcp/prompts) ·
[Tool reference](/docs/reference/mcp-tools)
