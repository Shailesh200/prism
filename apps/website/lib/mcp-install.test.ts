import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRISM_CODEX_TOML,
  PRISM_CURSOR_INSTALL_URL,
  PRISM_CURSOR_TRANSPORT,
  PRISM_MCP_JSON_STRING,
  PRISM_MCP_PACKAGE,
  PRISM_MCP_TRANSPORT,
  PRISM_OPENCODE_JSON_STRING,
  PRISM_RECEIPT_CONFIG,
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
    expect(server.name).toBe(PRISM_MCP_PACKAGE);
    expect(server.private).not.toBe(true);
    expect(server.version.startsWith("2.")).toBe(true);
    expect(Object.keys(server.bin)).toEqual(["prism-mcp"]);
    expect(server.files).toContain("dist");
  });

  it("is npx with the package pinned to major 2, and nothing else", () => {
    const entry = (
      JSON.parse(PRISM_MCP_JSON_STRING) as {
        mcpServers: { prism: Record<string, unknown> };
      }
    ).mcpServers.prism;
    expect(entry).toEqual({
      command: "npx",
      args: ["-y", "@repo-prism/mcp-server@2"],
    });
    expect(PRISM_CODEX_TOML).toBe(
      '[mcp_servers.prism]\ncommand = "npx"\nargs = ["-y", "@repo-prism/mcp-server@2"]\n',
    );
    const oc = (
      JSON.parse(PRISM_OPENCODE_JSON_STRING) as { mcp: { prism: unknown } }
    ).mcp.prism;
    expect(oc).toEqual({
      type: "local",
      command: ["npx", "-y", "@repo-prism/mcp-server@2"],
      enabled: true,
    });
  });

  it("carries no machine paths or env", () => {
    for (const s of [
      PRISM_MCP_JSON_STRING,
      PRISM_CODEX_TOML,
      PRISM_OPENCODE_JSON_STRING,
    ]) {
      expect(s).not.toMatch(/\/path\/to|PRISM_MCP_BIN|NODE_USE_SYSTEM_CA|env/);
    }
  });

  it("opens Cursor with the same transport plus PRISM_EXTRA_TOOLS=receipt", () => {
    const prefix =
      "cursor://anysphere.cursor-deeplink/mcp/install?name=prism&config=";
    expect(PRISM_CURSOR_INSTALL_URL.startsWith(prefix)).toBe(true);
    const config = PRISM_CURSOR_INSTALL_URL.slice(prefix.length);
    // The param is one URL-safe token: base64's + / = are percent-encoded.
    expect(config).toMatch(/^[A-Za-z0-9%]+$/);
    expect(new URL(PRISM_CURSOR_INSTALL_URL).searchParams.get("config")).toBe(
      decodeURIComponent(config),
    );
    expect(JSON.parse(atob(decodeURIComponent(config)))).toEqual({
      ...PRISM_MCP_TRANSPORT,
      env: { PRISM_EXTRA_TOOLS: "receipt" },
    });
    expect(PRISM_CURSOR_TRANSPORT.env.PRISM_EXTRA_TOOLS).toBe("receipt");
  });

  it("names a tool the server merges from PRISM_EXTRA_TOOLS", () => {
    expect(read("mcp-server", "src", "tools.ts")).toContain(
      "env.PRISM_EXTRA_TOOLS",
    );
    expect(read("shared", "src", "tool-names.ts")).toContain('"receipt"');
  });

  it("turns on the receipt tool the way install does", () => {
    expect(read("cli", "src", "install", "hosts.ts")).toContain(
      '["extraTools"], [...tools, "receipt"]',
    );
    expect(JSON.parse(PRISM_RECEIPT_CONFIG)).toEqual({
      extraTools: ["receipt"],
    });
  });
});
