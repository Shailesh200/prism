# Install

**Pick the surface you want. They share one engine, so you can install more than
one and they will agree with each other.**

## Requirements

| | |
|---|---|
| **Node.js** | 26 or newer |
| **Operating system** | macOS, Linux, or Windows |
| **A repository** | TypeScript or JavaScript; git optional but recommended |

Git is optional. Without it, Prism still parses and graphs your code; it simply
has nothing to say about ownership, churn, or history, and says so rather than
guessing.

## VS Code

Install **RepoPrism** (`prismhq.repo-prism`) from the
[Marketplace](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism),
or search `RepoPrism` in the Extensions panel.

Then: open a folder → Command Palette → **Prism: Open Prism**.

## Cursor

Install from [Open VSX](https://open-vsx.org/extension/prismhq/repo-prism), or
search `RepoPrism` in Extensions.

If the search index lags behind a release, download the `.vsix` and use
Command Palette → **Extensions: Install from VSIX…**.

Then: Command Palette → **Prism: Open Prism**.

## Command line

```bash
npm install -g @prism/cli
```

Check it:

```bash
prism --version
prism doctor
```

`prism doctor` reports your Node version, which workspace it resolved and why,
whether git is available, and whether an index exists. If something is going to
go wrong later, it usually shows up here first.

See [Using the CLI](../using/cli.md).

## MCP server, for AI agents

The MCP server lets an agent query your repository through the same engine.

```bash
npm install -g @prism/mcp-server
```

Then point your MCP client at the `prism-mcp` binary. For Cursor, in
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

Without `--workspace`, the server uses `PRISM_WORKSPACE` or the directory it was
started in. See [Using MCP](../using/mcp.md).

## From source

```bash
git clone https://github.com/Shailesh200/prism
cd prism
nvm use          # Node 26
bun install
bun run verify:milestone
```

A green `verify:milestone` on a fresh clone means your environment is correct.
See [CONTRIBUTING](https://github.com/Shailesh200/prism/blob/main/CONTRIBUTING.md).

## What gets created in your repository

Prism writes everything to a single directory:

```
your-repo/
  .prism/
    cache/           the index, and health scores over time
    consent.json     your decisions about optional network features
    bookmarks.json   places you marked on the map
    ingest/          artifacts you asked Prism to read, such as bundle stats
    tools/           tools you consented to install, such as Lighthouse
```

`ingest/` and `tools/` appear only if you use the features that need them.

It contains no secrets, but it is derived output and does not belong in version
control. Prism offers to add `.prism/` to your `.gitignore`, and you should let
it.

## Next

[Run your first analysis](./quickstart.md).
