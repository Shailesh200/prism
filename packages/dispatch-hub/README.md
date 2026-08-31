# `@repo-prism/dispatch-hub`

Loopback dashboard and OS notifications for Prism Dispatch jobs (ADR-0043).

The host MCP server (`prism-mcp`) spawns this daemon when a chat session
starts. It binds `127.0.0.1:17330`, watches every registered workspace's
`.prism/dispatch/` tree, and serves a live jobs board.

```text
npx prism-hub
# or: bun run --filter @repo-prism/dispatch-hub start
```

`PRISM_HUB=0` on the MCP process skips spawn. `PRISM_HUB_HOME` and
`PRISM_HUB_PORT` override the state directory and bind port (tests).

## Claude Code statusLine (M-066)

`prism-hub statusline` prints one line of live job state for Claude Code's
footer — it reads the same `.prism/dispatch/` files, so it works with no
daemon running. `--setup` prints the `statusLine` block to merge into
`~/.claude/settings.json`.

**Must never** be imported by `@repo-prism/core` or any engine package. The
IDE extension talks to it over HTTP rather than importing this package.
