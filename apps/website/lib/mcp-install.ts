/** Canonical one-click MCP install config for Prism (M-063, M-067 P-S5). */

import { PRISM_TOOL_COUNT } from "@repo-prism/shared";

export { PRISM_TOOL_COUNT };

export const PRISM_MCP_SERVER_NAME = "prism";

/**
 * The launch line, byte-identical to `packages/mcp-server/mcp-install.json`.
 *
 * No workspace variable: the server resolves the open folder from MCP roots
 * (retrying while unresolved, and following `roots/list_changed`), so the
 * config works as-is in clients that report roots. `NODE_USE_SYSTEM_CA` stays
 * — it is about the npm download trusting corporate proxy CAs, not the
 * workspace.
 */
export const PRISM_MCP_TRANSPORT = {
  command: "npx",
  args: ["-y", "--prefer-online", "@repo-prism/mcp-server@latest"],
  env: {
    NODE_USE_SYSTEM_CA: "1",
  },
} as const;

export const PRISM_MCP_JSON = {
  mcpServers: {
    [PRISM_MCP_SERVER_NAME]: PRISM_MCP_TRANSPORT,
  },
} as const;

export const PRISM_MCP_JSON_STRING = `${JSON.stringify(PRISM_MCP_JSON, null, 2)}\n`;

export const PRISM_CLAUDE_CODE_COMMAND =
  "claude mcp add prism -- npx -y --prefer-online @repo-prism/mcp-server@latest";

/** Codex reads TOML, so it cannot take the JSON block. */
export const PRISM_CODEX_TOML = `[mcp_servers.prism]
command = "npx"
args = ["-y", "--prefer-online", "@repo-prism/mcp-server@latest"]
`;

/**
 * Where Claude Desktop keeps its config. It has no CLI and no deeplink, so the
 * path is the whole instruction — and it is the one people cannot guess.
 */
export const CLAUDE_DESKTOP_CONFIG_PATHS = {
  macos: "~/Library/Application Support/Claude/claude_desktop_config.json",
  windows: "%APPDATA%\\Claude\\claude_desktop_config.json",
} as const;

/** The plugin pack: skills and commands, installed from the editor (ADR-0050). */
export const PRISM_PLUGIN_COMMAND = "npx -y @repo-prism/plugin@latest";

function base64UrlSafe(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/** Cursor deeplink — opens install prompt in Cursor. */
export function cursorMcpInstallHref(): string {
  const config = base64UrlSafe(JSON.stringify(PRISM_MCP_TRANSPORT));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${PRISM_MCP_SERVER_NAME}&config=${config}`;
}

/** VS Code MCP extension install link (stdio transport). */
export function vscodeMcpInstallHref(): string {
  const payload = encodeURIComponent(
    JSON.stringify({
      name: PRISM_MCP_SERVER_NAME,
      ...PRISM_MCP_TRANSPORT,
    }),
  );
  return `vscode:mcp/install?${payload}`;
}
