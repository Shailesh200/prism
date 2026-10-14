/** Canonical one-click MCP install config for Prism (M-063, M-067 P-S5). */

import { PRISM_TOOL_COUNT } from "@repo-prism/shared";

export { PRISM_TOOL_COUNT };

export const PRISM_MCP_SERVER_NAME = "prism";

/**
 * The launch line, byte-identical to `packages/mcp-server/mcp-install.json`.
 *
 * Prism 2.0 launches the installed `prism-mcp` binary (plan §2.2), never a
 * registry download: install the CLI once, then `prism install <host>`
 * writes this entry for you. No workspace variable: the server resolves the
 * open folder from MCP roots.
 */
export const PRISM_MCP_TRANSPORT = {
  command: "prism-mcp",
  args: [],
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

/** Installs the CLI (which ships `prism-mcp`) and wires Claude Code. */
export const PRISM_INSTALL_COMMAND =
  "npm install -g @repo-prism/cli && prism install claude";

export const PRISM_CLAUDE_CODE_COMMAND = "claude mcp add prism -- prism-mcp";

/** Codex reads TOML, so it cannot take the JSON block. */
export const PRISM_CODEX_TOML = `[mcp_servers.prism]
command = "prism-mcp"
args = []
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
