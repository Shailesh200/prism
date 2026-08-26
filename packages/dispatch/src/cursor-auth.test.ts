import { describe, expect, it } from "vitest";
import {
  ensureCursorWorkerAuth,
  inspectCursorWorkerAuth,
  type CursorAuthPort,
} from "./cursor-auth.js";
import { isPrismMcpBin, resolveMcpLaunch } from "./worker.js";

const missingAuth: CursorAuthPort = {
  async status() {
    return { kind: "missing" };
  },
  async login() {
    throw new Error("login should not run during inspect");
  },
};

describe("inspectCursorWorkerAuth", () => {
  it("prefers CURSOR_API_KEY over a stored login", () => {
    const row = inspectCursorWorkerAuth(
      { CURSOR_API_KEY: " env-key " },
      { kind: "stored", email: "a@b.com" },
    );
    expect(row).toMatchObject({
      ready: true,
      source: "env",
      apiKey: "env-key",
    });
  });

  it("treats a stored SDK login as ready without exposing the key", () => {
    const row = inspectCursorWorkerAuth(
      {},
      { kind: "stored", email: "a@b.com" },
    );
    expect(row.ready).toBe(true);
    expect(row.source).toBe("stored");
    expect(row.apiKey).toBeUndefined();
    expect(row.message).toContain("a@b.com");
    expect(row.message).not.toMatch(/API key|mcp\.json|SDK login/i);
  });

  it("does not tell the user to paste a key into mcp.json", () => {
    const row = inspectCursorWorkerAuth({}, { kind: "missing" });
    expect(row.ready).toBe(false);
    expect(row.message).toMatch(/browser/);
    expect(row.message).not.toMatch(/API key|mcp\.json|CURSOR_API_KEY/i);
  });
});

describe("ensureCursorWorkerAuth", () => {
  it("skips login when an env key is already set", async () => {
    const row = await ensureCursorWorkerAuth({
      env: { CURSOR_API_KEY: "k" },
      auth: missingAuth,
    });
    expect(row.source).toBe("env");
    expect(row.apiKey).toBe("k");
  });

  it("skips login when the SDK store already has a login", async () => {
    const auth: CursorAuthPort = {
      async status() {
        return { kind: "stored", email: "dev@prism.test" };
      },
      async login() {
        throw new Error("should not login");
      },
    };
    const row = await ensureCursorWorkerAuth({ env: {}, auth });
    expect(row).toMatchObject({ ready: true, source: "stored" });
  });

  it("opens the system browser for Cursor.auth.login", async () => {
    let opened = false;
    const auth: CursorAuthPort = {
      async status() {
        return { kind: "missing" };
      },
      async login(options) {
        opened = options.openBrowser;
        options.onLoginUrl?.("https://cursor.com/loginDeepControl?x=1");
        return {
          apiKey: "minted-key",
          email: "dev@prism.test",
          expiresAtMs: Date.now() + 1_000,
        };
      },
    };
    const row = await ensureCursorWorkerAuth({ env: {}, auth });
    expect(opened).toBe(true);
    expect(row).toMatchObject({
      ready: true,
      source: "login",
      apiKey: "minted-key",
    });
  });
});

describe("resolveMcpLaunch", () => {
  it("prefers PRISM_MCP_BIN", () => {
    expect(resolveMcpLaunch({ PRISM_MCP_BIN: "/opt/bin.js" }, [])).toEqual({
      command: process.execPath,
      args: ["/opt/bin.js"],
    });
  });

  it("reuses the running mcp-server bin so users do not set PRISM_MCP_BIN", () => {
    const self = "/Users/me/Prism/packages/mcp-server/dist/bin.js";
    expect(isPrismMcpBin(self)).toBe(true);
    expect(resolveMcpLaunch({}, ["node", self])).toEqual({
      command: process.execPath,
      args: [self],
    });
  });

  it("falls back to npx for unknown hosts", () => {
    expect(resolveMcpLaunch({}, ["node", "/usr/bin/vitest"])).toEqual({
      command: "npx",
      args: ["-y", "@repo-prism/mcp-server"],
    });
  });
});
