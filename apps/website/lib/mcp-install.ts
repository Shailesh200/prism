/**
 * The MCP entry to add by hand, per agent. It launches the published
 * `@repo-prism/mcp-server` package (its one bin is `prism-mcp`) through npx,
 * pinned to major 2. No env is needed: the server finds its own bin on the
 * PATH npx sets up. Checked with `initialize` + `tools/list` against a packed
 * install; see lib/mcp-install.test.ts for the package facts it relies on.
 */

export const PRISM_MCP_SERVER_NAME = "prism";
export const PRISM_MCP_PACKAGE = "@repo-prism/mcp-server";

export const PRISM_MCP_TRANSPORT = {
  command: "npx",
  args: ["-y", `${PRISM_MCP_PACKAGE}@2`],
} as const;

/** Claude Code (~/.claude.json or .mcp.json), Cursor (~/.cursor/mcp.json) and any MCP agent. */
export const PRISM_MCP_JSON_STRING = `${JSON.stringify(
  { mcpServers: { [PRISM_MCP_SERVER_NAME]: PRISM_MCP_TRANSPORT } },
  null,
  2,
)}\n`;

/** Codex (~/.codex/config.toml). */
export const PRISM_CODEX_TOML = `[mcp_servers.prism]
command = "npx"
args = [${PRISM_MCP_TRANSPORT.args.map((a) => JSON.stringify(a)).join(", ")}]
`;

/** opencode (~/.config/opencode/opencode.json): a local server under `mcp`. */
export const PRISM_OPENCODE_JSON_STRING = `${JSON.stringify(
  {
    mcp: {
      [PRISM_MCP_SERVER_NAME]: {
        type: "local",
        command: [PRISM_MCP_TRANSPORT.command, ...PRISM_MCP_TRANSPORT.args],
        enabled: true,
      },
    },
  },
  null,
  2,
)}\n`;

/**
 * Turns on the opt-in `receipt` tool (~/.prism/config.json), as `prism install`
 * does for Cursor, Codex and opencode. Without hooks, the agent calls it.
 */
export const PRISM_RECEIPT_CONFIG = `${JSON.stringify({ extraTools: ["receipt"] }, null, 2)}\n`;

/** Cursor's one-click MCP install: opens Cursor, which asks before it adds the server. */
export const PRISM_CURSOR_INSTALL_URL = `cursor://anysphere.cursor-deeplink/mcp/install?name=${PRISM_MCP_SERVER_NAME}&config=${encodeURIComponent(btoa(JSON.stringify(PRISM_MCP_TRANSPORT)))}`;
