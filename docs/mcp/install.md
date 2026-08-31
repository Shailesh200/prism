---
title: Install MCP
description: "Connect Prism to Claude Code, Cursor, Claude Desktop, or Codex."
---

Set Prism up once. After that, talk to the agent in plain language — you never
type tool names.

**Needs:** Node.js 26+, and your project open (or `cd`'d into). Workspace
resolves automatically: `--workspace` → `PRISM_WORKSPACE` → Cursor
`${workspaceFolder}` (`CURSOR_WORKSPACE`) → MCP roots → host
`WORKSPACE_FOLDER_PATHS` → nearest git root → cwd. Editor sandbox folders
(`Library/Containers`) are never treated as the project.

## One-click install

### Cursor

[Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=prism&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi0tcHJlZmVyLW9ubGluZSIsIkByZXBvLXByaXNtL21jcC1zZXJ2ZXJAbGF0ZXN0Il0sImVudiI6eyJOT0RFX1VTRV9TWVNURU1fQ0EiOiIxIiwiQ1VSU09SX1dPUktTUEFDRSI6IiR7d29ya3NwYWNlRm9sZGVyfSJ9fQ==)

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
        "NODE_USE_SYSTEM_CA": "1",
        "CURSOR_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

Canonical copy: [`packages/mcp-server/mcp-install.json`](https://github.com/Shailesh200/prism/blob/main/packages/mcp-server/mcp-install.json)

Keep `@latest` — do not pin a version after each publish. From 1.1.7 the
server checks npm at startup and hops to the newer package when the `_npx`
cache is stale. A running session cannot swap binaries mid-chat; quit Cursor
once (or toggle prism off/on once) after you first land 1.1.7. Later
publishes apply on the next start. Logs: `prism-mcp 1.1.15: workspace …`.

`${workspaceFolder}` is Cursor interpolation, not a path you type. Combined
with MCP roots and the start_job workspace argument (the folder the agent
already has open), Dispatch should see the git repo even when the process cwd
is Library/Containers.

## Claude Code

```bash
cd /path/to/your/project
claude mcp add prism -- npx -y --prefer-online @repo-prism/mcp-server@latest
```

Restart Claude Code if it was already open. Ask: "What is this repository?"
Dispatch jobs run on the Claude Code you are already signed in to — no Cursor
login. Say **prism init** to check that sign-in before starting a job.

Optional footer: `npx -y --prefer-online @repo-prism/dispatch-hub@latest
statusline --setup` prints a `statusLine` block for `~/.claude/settings.json`
— live job state pinned under the prompt.

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
        "NODE_USE_SYSTEM_CA": "1",
        "CURSOR_WORKSPACE": "${workspaceFolder}"
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
