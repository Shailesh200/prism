import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Prism, type PrismWorkspace } from "@repo-prism/core";
import {
  type PrismError,
  PrismErrorCode,
  type Result,
  err,
  ok,
  prismError,
} from "@repo-prism/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  callDaemonTool,
  daemonStatus,
  stopDaemon,
  warmDaemonWorkspace,
} from "./client.js";
import { daemonRecordPath } from "./paths.js";
import { readDaemonRecord } from "./record.js";
import { type DaemonTool, startDaemon } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
  here,
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

const findTool: DaemonTool = {
  parseArgs(raw) {
    const name = (raw as { name?: unknown })?.name;
    return typeof name === "string" && name
      ? ok({ name })
      : err(prismError(PrismErrorCode.VALIDATION, "name is required"));
  },
  async call({ workspace }, args) {
    const found = workspace.findSymbol(args as { name: string });
    return found.ok ? ok(found.value.map((hit) => hit.path)) : found;
  },
};

const throwingTool: DaemonTool = {
  parseArgs: (raw) => ok(raw),
  async call() {
    throw new Error("boom");
  },
};

const TOOLS = new Map([
  ["find", findTool],
  ["explode", throwingTool],
]);

let home: string;
let repo: string;
let env: NodeJS.ProcessEnv;
let opens: number;
let close: (() => Promise<void>) | undefined;

function countingOpen(root: string): Result<PrismWorkspace, PrismError> {
  opens += 1;
  return Prism.create().openRepository(root);
}

async function start(buildId = "test-build") {
  const started = await startDaemon({
    buildId,
    tools: TOOLS,
    env,
    openWorkspace: countingOpen,
    timers: false,
    config: { debounceMs: 50 },
    log: () => undefined,
  });
  if (started.kind === "started") close = started.close;
  return started;
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "prism-daemon-home-"));
  repo = await mkdtemp(join(tmpdir(), "prism-daemon-repo-"));
  await cp(FIXTURE, repo, {
    recursive: true,
    filter: (source) => !source.includes(`${"/"}.prism`),
  });
  env = { ...process.env, PRISM_HOME: home, PRISM_DAEMON: "1" };
  opens = 0;
});

afterEach(async () => {
  await close?.();
  close = undefined;
  await rm(home, { recursive: true, force: true });
  await rm(repo, { recursive: true, force: true });
});

describe("prism daemon (M-095)", () => {
  it("answers tool calls from one shared index", async () => {
    const started = await start();
    expect(started.kind).toBe("started");

    const first = await callDaemonTool<string[]>({
      root: repo,
      tool: "find",
      args: { name: "renderDashboard" },
      env,
    });
    const second = await callDaemonTool<string[]>({
      root: repo,
      tool: "find",
      args: { name: "renderDashboard" },
      env,
    });
    expect(first).toEqual({
      kind: "ok",
      value: ["src/features/dashboard/Dashboard.ts"],
    });
    expect(second).toEqual(first);
    // Two callers, one open and one index.
    expect(opens).toBe(1);
  });

  it("writes a 0600 record and reports status", async () => {
    await start();
    const mode = (await stat(daemonRecordPath(env))).mode & 0o777;
    expect(mode).toBe(0o600);

    await warmDaemonWorkspace({ root: repo, env });
    const status = await daemonStatus({ env });
    expect(status.kind).toBe("ok");
    if (status.kind !== "ok") return;
    expect(status.value.pid).toBe(process.pid);
    expect(status.value.workspaces.map((row) => row.root)).toEqual([repo]);
  });

  it("refuses a second daemon while the first answers", async () => {
    await start();
    const second = await startDaemon({
      buildId: "test-build",
      tools: TOOLS,
      env,
      timers: false,
      log: () => undefined,
    });
    expect(second.kind).toBe("already-running");
  });

  it("treats another build, a bad token and a browser origin as unavailable", async () => {
    await start("build-a");
    const other = await callDaemonTool({
      root: repo,
      tool: "find",
      args: { name: "x" },
      env,
      buildId: "build-b",
    });
    expect(other).toEqual({
      kind: "unavailable",
      reason: "daemon is from another build",
    });

    const record = await readDaemonRecord(env);
    if (!record) throw new Error("no record");
    const url = `http://127.0.0.1:${record.port}/v1/status`;
    expect((await fetch(url)).status).toBe(401);
    expect(
      (
        await fetch(url, {
          headers: {
            Authorization: `Bearer ${record.token}`,
            Origin: "http://evil.example",
          },
        })
      ).status,
    ).toBe(403);
  });

  it("returns tool errors as errors and crashes as unavailable", async () => {
    await start();
    const invalid = await callDaemonTool({
      root: repo,
      tool: "find",
      args: {},
      env,
    });
    expect(invalid.kind).toBe("error");

    const crashed = await callDaemonTool({
      root: repo,
      tool: "explode",
      args: {},
      env,
    });
    expect(crashed).toEqual({ kind: "unavailable", reason: "boom" });
  });

  it("reflects a file edit without a manual reindex", async () => {
    await start();
    const before = await callDaemonTool<string[]>({
      root: repo,
      tool: "find",
      args: { name: "freshlyAdded" },
      env,
    });
    expect(before).toEqual({ kind: "ok", value: [] });

    const target = join(repo, "src", "features", "dashboard", "widgets.ts");
    await writeFile(
      target,
      `${await readFile(target, "utf8")}\nexport function freshlyAdded(): number {\n  return 1;\n}\n`,
    );

    const deadline = Date.now() + 10_000;
    let after: unknown;
    while (Date.now() < deadline) {
      after = await callDaemonTool<string[]>({
        root: repo,
        tool: "find",
        args: { name: "freshlyAdded" },
        env,
      });
      if ((after as { kind: string; value?: string[] }).value?.length === 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(after).toEqual({
      kind: "ok",
      value: ["src/features/dashboard/widgets.ts"],
    });
  });

  it("stops on request and removes its record", async () => {
    await start();
    expect((await stopDaemon({ env })).kind).toBe("ok");
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline && (await readDaemonRecord(env))) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(await readDaemonRecord(env)).toBeUndefined();
    close = undefined;
    const after = await callDaemonTool({
      root: repo,
      tool: "find",
      args: { name: "x" },
      env,
    });
    expect(after.kind).toBe("unavailable");
  });
});
