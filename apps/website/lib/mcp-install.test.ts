import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    ) as {
      command: string;
      args: string[];
      env?: { NODE_USE_SYSTEM_CA?: string };
    };
    expect(decoded.command).toBe("prism-mcp");
    expect(decoded.args).toEqual([]);
    expect(decoded.env?.NODE_USE_SYSTEM_CA).toBe("1");
  });

  it("mcp json includes prism server", () => {
    const parsed = JSON.parse(PRISM_MCP_JSON_STRING) as {
      mcpServers: { prism: { command: string } };
    };
    expect(parsed.mcpServers.prism.command).toBe("prism-mcp");
  });

  it("never launches through npx (plan §2.2)", () => {
    expect(PRISM_CLAUDE_CODE_COMMAND).toBe("claude mcp add prism -- prism-mcp");
    expect(PRISM_MCP_JSON_STRING).not.toContain("npx");
  });

  it("matches packages/mcp-server/mcp-install.json byte for byte", () => {
    const shipped = readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "packages",
        "mcp-server",
        "mcp-install.json",
      ),
      "utf8",
    );
    expect(PRISM_MCP_JSON_STRING).toBe(shipped);
  });
});
