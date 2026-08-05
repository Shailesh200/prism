# Using Prism in Cursor

**Two ways, and they are worth using together: the visual extension, and the MCP
server that gives Cursor's agent access to the same analysis.**

## The extension

Install **RepoPrism** from
[Open VSX](https://open-vsx.org/extension/prismhq/repo-prism), or search
`RepoPrism` in Extensions. If the search index lags a release, download the
`.vsix` and use Command Palette → **Extensions: Install from VSIX…**.

Then: Command Palette → **Prism: Open Prism**.

Everything in [Using the VS Code extension](./vscode-extension.md) applies —
Cursor runs the same extension.

## The MCP server

This is the part specific to Cursor, and the more interesting half.

```bash
npm install -g @prism/mcp-server
```

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "prism": {
      "command": "prism-mcp",
      "args": ["--workspace", "/absolute/path/to/your/repo"]
    }
  }
}
```

Restart Cursor. The Prism tools appear in the MCP panel.

## Using both

The combination is the point. You read the map; the agent reads the graph.

A pattern that works: before asking Cursor to make a change, ask it to check the
blast radius first.

> Use Prism to check what depends on `src/auth/session.ts` and which tests cover
> it. Then change the session timeout to 30 minutes.

The agent gets the real dependent list rather than inferring one from the files
it happens to have open, and you get a change that accounts for callers neither
of you would have remembered.

See [Using Prism with an AI agent](./mcp.md) for how the server behaves and why
every tool is read-only.

## Related

[MCP](./mcp.md) · [VS Code extension](./vscode-extension.md) · [MCP tool reference](../reference/mcp-tools.md)
