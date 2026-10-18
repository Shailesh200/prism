import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRISM_CODEX_TOML,
  PRISM_CURSOR_INSTALL_URL,
  PRISM_MCP_JSON_STRING,
  PRISM_MCP_PACKAGE,
  PRISM_MCP_TRANSPORT,
  PRISM_OPENCODE_JSON_STRING,
} from "./mcp-install";

const packages = join(process.cwd(), "..", "..", "packages");
const read = (...p: string[]) => readFileSync(join(packages, ...p), "utf8");
const server = JSON.parse(read("mcp-server", "package.json")) as {
  name: string;
  version: string;
  bin: Record<string, string>;
  files: string[];
  private?: boolean;
};

describe("mcp-install", () => {
  it("launches the published server package, whose only bin is prism-mcp", () => {
    expect(PRISM_MCP_PACKAGE).toBe("@prismapp/mcp-server");
    expect(server.name).toBe("@repo-prism/mcp-server");
    expect(server.private).not.toBe(true);
    expect(server.version.startsWith("2.")).toBe(true);
    expect(Object.keys(server.bin)).toEqual(["prism-mcp"]);
    expect(server.files).toContain("dist");
  });

  it("is one npx entry for the latest package, with the receipt tool on", () => {
    const entry = (
      JSON.parse(PRISM_MCP_JSON_STRING) as {
        mcpServers: { prism: Record<string, unknown> };
      }
    ).mcpServers.prism;
    expect(entry).toEqual({
      command: "npx",
      args: ["-y", "@prismapp/mcp-server"],
      env: { PRISM_EXTRA_TOOLS: "receipt" },
    });
    expect(PRISM_CODEX_TOML).toBe(
      '[mcp_servers.prism]\ncommand = "npx"\nargs = ["-y", "@prismapp/mcp-server"]\n\n[mcp_servers.prism.env]\nPRISM_EXTRA_TOOLS = "receipt"\n',
    );
    const oc = (
      JSON.parse(PRISM_OPENCODE_JSON_STRING) as { mcp: { prism: unknown } }
    ).mcp.prism;
    expect(oc).toEqual({
      type: "local",
      command: ["npx", "-y", "@prismapp/mcp-server"],
      environment: { PRISM_EXTRA_TOOLS: "receipt" },
      enabled: true,
    });
    for (const s of [
      PRISM_MCP_JSON_STRING,
      PRISM_CODEX_TOML,
      PRISM_OPENCODE_JSON_STRING,
    ]) {
      expect(s).not.toMatch(/@\d|\/path\/to|PRISM_MCP_BIN|NODE_USE_SYSTEM_CA/);
    }
  });

  it("opens Cursor with the same transport in the config param", () => {
    const prefix =
      "cursor://anysphere.cursor-deeplink/mcp/install?name=prism&config=";
    expect(PRISM_CURSOR_INSTALL_URL.startsWith(prefix)).toBe(true);
    const config = PRISM_CURSOR_INSTALL_URL.slice(prefix.length);
    expect(JSON.parse(atob(decodeURIComponent(config)))).toEqual(
      PRISM_MCP_TRANSPORT,
    );
  });

  it("turns on the receipt tool the way install does", () => {
    expect(read("cli", "src", "commands", "install.ts")).toContain(
      '["extraTools"], [...tools, "receipt"]',
    );
    expect(PRISM_MCP_TRANSPORT.env).toEqual({ PRISM_EXTRA_TOOLS: "receipt" });
  });
});
