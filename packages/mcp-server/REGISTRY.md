# MCP Registry submission — `@repo-prism/mcp-server`

Prepared in M-063. **Publishing is an owner action** — the repo cannot push to
`registry.modelcontextprotocol.io` on your behalf.

## Files

| File | Purpose |
|---|---|
| [`server.json`](./server.json) | Registry manifest (`io.github.Shailesh200/prism`) |
| [`package.json`](./package.json) | Includes `mcpName` for npm ownership verification |
| [`mcp-install.json`](./mcp-install.json) | Copy-paste MCP config for clients |

## Before you publish

1. **npm package live** — `@repo-prism/mcp-server@1.1.17` (or bump `version` +
   `mcpName` together in `server.json` and `package.json`).
2. **`mcpName` matches `server.json` `name`** — both must be
   `io.github.Shailesh200/prism`.
3. **Build** — `bun run build` in this package (or `moon run mcp-server:build`).

## Owner steps

1. Install the publisher CLI (see [MCP Registry quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx)):
   ```bash
   brew install mcp-publisher
   # or download from registry releases
   ```
2. From `packages/mcp-server/`:
   ```bash
   mcp-publisher login github
   mcp-publisher publish
   ```
3. Verify:
   ```bash
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.Shailesh200/prism"
   ```

## Namespace note

GitHub auth requires the `io.github.Shailesh200/` prefix. For a custom domain
namespace later (e.g. `io.prismhq.in/prism`), use [DNS authentication](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.md)
after `prismhq.in` is live.

## Troubleshooting

| Error | Fix |
|---|---|
| Registry validation failed for package | Ensure published npm tarball includes `mcpName` |
| Permission denied | Log in as the GitHub user that owns `Shailesh200/prism` |
| Version already exists | Bump `version` in `package.json`, publish npm, update `server.json`, republish |
