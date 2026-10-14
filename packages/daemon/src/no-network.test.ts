import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as net from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismErrorCode, err, ok, prismError } from "@repo-prism/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callDaemonTool, daemonStatus } from "./client.js";
import { readDaemonRecord } from "./record.js";
import { type DaemonTool, startDaemon } from "./server.js";

/**
 * The daemon is a long-running local process (ADR-0063 §5). Every socket it
 * or its client opens while indexing, watching and answering must be
 * loopback, and it must not accept a connection on any other address.
 */

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

const targets: string[] = [];
const originalConnect = net.Socket.prototype.connect;

const find: DaemonTool = {
  parseArgs: (raw) => {
    const name = (raw as { name?: unknown })?.name;
    return typeof name === "string"
      ? ok({ name })
      : err(prismError(PrismErrorCode.VALIDATION, "name"));
  },
  async call({ workspace }, args) {
    const found = workspace.findSymbol(args as { name: string });
    return found.ok ? ok(found.value.length) : found;
  },
};

let home: string;
let repo: string;
let env: NodeJS.ProcessEnv;
let close: () => Promise<void>;

beforeAll(async () => {
  net.Socket.prototype.connect = function (
    this: net.Socket,
    ...args: unknown[]
  ) {
    const first = args[0] as { host?: string; port?: number } | number;
    targets.push(
      typeof first === "object"
        ? String(first.host ?? "localhost")
        : String(args[1] ?? "localhost"),
    );
    return (originalConnect as (...a: unknown[]) => net.Socket).apply(
      this,
      args,
    );
  } as typeof net.Socket.prototype.connect;

  home = await mkdtemp(join(tmpdir(), "prism-daemon-net-home-"));
  repo = await mkdtemp(join(tmpdir(), "prism-daemon-net-repo-"));
  await cp(FIXTURE, repo, {
    recursive: true,
    filter: (source) => !source.includes("/.prism"),
  });
  env = { ...process.env, PRISM_HOME: home, PRISM_DAEMON: "1" };
  const started = await startDaemon({
    buildId: "net",
    tools: new Map([["find", find]]),
    env,
    timers: false,
    config: { debounceMs: 30 },
    log: () => undefined,
  });
  if (started.kind !== "started") throw new Error("daemon did not start");
  close = started.close;
});

afterAll(async () => {
  net.Socket.prototype.connect = originalConnect;
  await close?.();
  await rm(home, { recursive: true, force: true });
  await rm(repo, { recursive: true, force: true });
});

describe("daemon stays on this machine", () => {
  it("only ever connects to loopback while indexing, watching and answering", async () => {
    expect(
      (
        await callDaemonTool({
          root: repo,
          tool: "find",
          args: { name: "x" },
          env,
        })
      ).kind,
    ).toBe("ok");
    await writeFile(
      join(repo, "src", "features", "dashboard", "extra.ts"),
      "export const extra = 1;\n",
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await daemonStatus({ env })).kind).toBe("ok");

    expect(targets.length).toBeGreaterThan(0);
    for (const host of targets) {
      expect(["127.0.0.1", "localhost", "::1"]).toContain(host);
    }
  });

  it("does not accept connections on a non-loopback address", async () => {
    const record = await readDaemonRecord(env);
    if (!record) throw new Error("no record");
    const external = Object.values(networkInterfaces())
      .flat()
      .find((row) => row && row.family === "IPv4" && !row.internal)?.address;
    if (!external) return;
    const reached = await new Promise<boolean>((resolve) => {
      const connect = originalConnect as (
        this: net.Socket,
        options: net.SocketConnectOpts,
      ) => net.Socket;
      const socket = connect.call(new net.Socket(), {
        port: record.port,
        host: external,
      });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.setTimeout(1_000, () => {
        socket.destroy();
        resolve(false);
      });
    });
    expect(reached).toBe(false);
  });
});
