import { describe, expect, it } from "vitest";
import {
  applyMcpUpdate,
  isLocalPrismInstall,
  isNewerVersion,
  mcpUpdateStatus,
} from "./update.js";

describe("isNewerVersion", () => {
  it("compares npm semver triplets", () => {
    expect(isNewerVersion("1.9.1", "1.9.0")).toBe(true);
    expect(isNewerVersion("1.9.0", "1.9.0")).toBe(false);
    expect(isNewerVersion("1.8.9", "1.9.0")).toBe(false);
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(true);
  });
});

describe("isLocalPrismInstall", () => {
  it("skips a packages checkout and hops an npx cache", () => {
    expect(
      isLocalPrismInstall("/Users/me/Prism/packages/dispatch-hub/src/bin.ts"),
    ).toBe(true);
    expect(
      isLocalPrismInstall(
        "/Users/me/.npm/_npx/abc/node_modules/@repo-prism/mcp-server/dist/bin.js",
      ),
    ).toBe(false);
  });
});

describe("mcpUpdateStatus", () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ version: "1.9.1" }), { status: 200 });

  it("asks an npx install to reload when npm is newer", async () => {
    const status = await mcpUpdateStatus("1.9.0", fetchImpl, false);
    expect(status.stale).toBe(true);
    expect(status.hop).toBe("reload");
    expect(status.localCheckout).toBe(false);
  });

  it("will not hop a local checkout", async () => {
    const status = await mcpUpdateStatus("1.9.0", fetchImpl, true);
    expect(status.stale).toBe(true);
    expect(status.hop).toBe("local");
  });
});

describe("applyMcpUpdate", () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ version: "1.9.1" }), { status: 200 });

  it("caches a newer version so reload can hop", async () => {
    const seen: string[] = [];
    const result = await applyMcpUpdate("1.9.0", {
      localCheckout: false,
      fetchImpl,
      pack: async (version, dest) => {
        seen.push(`${version}:${dest}`);
        return { ok: true, detail: "cached" };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.cached).toBe(true);
    expect(result.latest).toBe("1.9.1");
    expect(result.message).toMatch(/Reload Prism MCP/i);
    expect(seen[0]).toMatch(/^1\.9\.1:/);
  });

  it("does not pack when already current", async () => {
    let packed = 0;
    const current: typeof fetch = async () =>
      new Response(JSON.stringify({ version: "1.9.0" }), { status: 200 });
    const result = await applyMcpUpdate("1.9.0", {
      localCheckout: false,
      fetchImpl: current,
      pack: async () => {
        packed += 1;
        return { ok: true, detail: "cached" };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.cached).toBe(false);
    expect(packed).toBe(0);
  });

  it("refuses to hop a local checkout", async () => {
    const result = await applyMcpUpdate("1.9.0", {
      localCheckout: true,
      fetchImpl,
      pack: async () => ({ ok: true, detail: "cached" }),
    });
    expect(result.ok).toBe(false);
    expect(result.cached).toBe(false);
    expect(result.message).toMatch(/local/i);
  });
});
