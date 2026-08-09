import { describe, expect, it } from "vitest";
import {
  PRISM_CLAUDE_CODE_COMMAND,
  PRISM_MCP_JSON_STRING,
  cursorMcpInstallHref,
} from "./mcp-install";

describe("mcp-install", () => {
  it("cursor deeplink encodes transport config", () => {
    const href = cursorMcpInstallHref();
    expect(
      href.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?"),
    ).toBe(true);
    const config = new URL(href).searchParams.get("config");
    expect(config).toBeTruthy();
    const decoded = JSON.parse(
      Buffer.from(config!, "base64").toString("utf8"),
    ) as { command: string; args: string[] };
    expect(decoded.command).toBe("npx");
    expect(decoded.args).toContain("@repo-prism/mcp-server");
  });

  it("mcp json includes prism server", () => {
    const parsed = JSON.parse(PRISM_MCP_JSON_STRING) as {
      mcpServers: { prism: { command: string } };
    };
    expect(parsed.mcpServers.prism.command).toBe("npx");
  });

  it("claude code command uses npx", () => {
    expect(PRISM_CLAUDE_CODE_COMMAND).toContain("npx");
    expect(PRISM_CLAUDE_CODE_COMMAND).toContain("@repo-prism/mcp-server");
  });
});
