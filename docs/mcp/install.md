---
title: Install MCP
description: "Connect Prism to Claude Code, Cursor, Claude Desktop, or Codex."
---

Set Prism up once. After that, talk to the agent in plain language — you never
type tool names.

**Needs:** Node.js 26+, and your project open (or `cd`'d into). Workspace
resolves automatically: `--workspace` → `PRISM_WORKSPACE` → nearest git root →
cwd.

## Claude Code

```bash
cd /path/to/your/project
claude mcp add prism -- npx -y @repo-prism/mcp-server
```

Restart Claude Code if it was already open. Ask: "What is this repository?"

## Cursor

Create `.cursor/mcp.json` at the project root (or `~/.cursor/mcp.json` for every
project):

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

**Settings → MCP** → enable **prism** → wait for ~28 tools. No `--workspace` —
Cursor starts the server from the open project.

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
args = ["-y", "@repo-prism/mcp-server"]
```

Run Codex from inside your project directory.

## Do not

Run `prism-mcp` in a bare terminal and leave it on `ready on stdio` — that means
it is waiting for a client. Configure the client; the client starts the process.

## Next

[Usage](/docs/mcp/usage) · [Prompts](/docs/mcp/prompts) ·
[Tool reference](/docs/reference/mcp-tools)
