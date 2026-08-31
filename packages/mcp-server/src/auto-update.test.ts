import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import {
  fetchLatestMcpVersion,
  isLocalCheckout,
  isNewerVersion,
  maybeReexecLatest,
} from "./auto-update.js";

describe("auto-update", () => {
  it("compares dotted versions", () => {
    expect(isNewerVersion("1.1.7", "1.1.6")).toBe(true);
    expect(isNewerVersion("1.1.6", "1.1.6")).toBe(false);
    expect(isNewerVersion("1.1.5", "1.1.6")).toBe(false);
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(true);
  });

  it("reads version from the npm packument", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ version: "1.1.7" }), { status: 200 });
    await expect(fetchLatestMcpVersion(fetchImpl)).resolves.toBe("1.1.7");
  });

  it("skips workers and an already-hopped process", async () => {
    await expect(
      maybeReexecLatest({
        currentVersion: "1.1.6",
        argv: [],
        env: { PRISM_SKIP_SELF_UPDATE: "1" },
      }),
    ).resolves.toEqual({ status: "skipped" });
    await expect(
      maybeReexecLatest({
        currentVersion: "1.1.6",
        argv: [],
        env: { PRISM_DISPATCH_ROLE: "worker" },
      }),
    ).resolves.toEqual({ status: "skipped" });
  });

  it("recognises a checkout, but not an installed copy", () => {
    expect(
      isLocalCheckout("/Users/me/Prism/packages/mcp-server/dist/bin.js"),
    ).toBe(true);
    expect(
      isLocalCheckout("/Users/me/Prism/packages/mcp-server/src/bin.ts"),
    ).toBe(true);
    expect(
      isLocalCheckout(
        "/tmp/.npx/node_modules/@repo-prism/mcp-server/dist/bin.js",
      ),
    ).toBe(false);
    expect(isLocalCheckout(undefined)).toBe(false);
  });

  it("does not replace a developer's local build with npm", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 });
    await expect(
      maybeReexecLatest({
        currentVersion: "1.1.7",
        argv: [],
        env: {},
        entry: "/Users/me/Prism/packages/mcp-server/dist/bin.js",
        fetchImpl,
      }),
    ).resolves.toEqual({ status: "skipped" });
  });

  it("stays on the current binary when npm agrees", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ version: "1.1.7" }), { status: 200 });
    const result = await maybeReexecLatest({
      currentVersion: "1.1.7",
      argv: [],
      env: {},
      fetchImpl,
    });
    expect(result.status).toBe("current");
  });

  it("re-execs npx at the newer version", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ version: "1.1.8" }), { status: 200 });
    const spawned: { command: string; args: string[] }[] = [];
    const child = new EventEmitter() as EventEmitter & { pid?: number };
    const result = await maybeReexecLatest({
      currentVersion: "1.1.7",
      argv: ["--verbose"],
      env: { PATH: "/bin" },
      fetchImpl,
      spawnImpl: ((command, args) => {
        spawned.push({ command: String(command), args: args as string[] });
        return child;
      }) as typeof import("node:child_process").spawn,
    });
    expect(result.status).toBe("reexec");
    expect(spawned).toEqual([
      {
        command: "npx",
        args: ["-y", "@repo-prism/mcp-server@1.1.8", "--verbose"],
      },
    ]);
  });
});
