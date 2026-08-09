/** Canonical one-click MCP install config for Prism (M-063). */

export const PRISM_MCP_SERVER_NAME = "prism";

export const PRISM_MCP_TRANSPORT = {
  command: "npx",
  args: ["-y", "@repo-prism/mcp-server"],
} as const;

export const PRISM_MCP_JSON = {
  mcpServers: {
    [PRISM_MCP_SERVER_NAME]: PRISM_MCP_TRANSPORT,
  },
} as const;

export const PRISM_MCP_JSON_STRING = `${JSON.stringify(PRISM_MCP_JSON, null, 2)}\n`;

export const PRISM_CLAUDE_CODE_COMMAND =
  "claude mcp add prism -- npx -y @repo-prism/mcp-server";

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
