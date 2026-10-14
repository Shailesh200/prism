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
  callDaemonRoute,
  callDaemonTool,
  compareBuildIds,
  compareVersions,
  daemonHealth,
  daemonReady,
  ensureDaemon,
  daemonStatus,
  stopDaemon,
  warmDaemonWorkspace,
} from "./client.js";
import { daemonRecordPath } from "./paths.js";
import { readDaemonRecord, writeDaemonRecord } from "./record.js";
import {
  type DaemonRootRoute,
  type DaemonTool,
  MAX_READY_WAIT_MS,
  startDaemon,
} from "./server.js";

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

const echoRoute: DaemonTool = {
  parseArgs: (raw) => ok(raw),
  async call({ workspaceRoot }, args) {
    return ok({ workspaceRoot, args });
  },
};

const rootRoute: DaemonRootRoute = {
  parseArgs: (raw) => ok(raw),
  async call(root) {
    return ok({ root, at: "session" });
  },
};

async function start(buildId = "test-build") {
  const started = await startDaemon({
    buildId,
    tools: TOOLS,
    routes: new Map([["/v1/receipt", echoRoute]]),
    rootRoutes: new Map([["/v1/session", rootRoute]]),
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

  it("DH-1 answers a token-checked health probe; a stale record with a live pid is not running", async () => {
    await start();
    const health = await daemonHealth({ env });
    expect(health).toMatchObject({
      kind: "ok",
      value: { pid: process.pid, buildId: "test-build" },
    });
    const record = await readDaemonRecord(env);
    if (!record) throw new Error("no record");
    const health401 = await fetch(`http://127.0.0.1:${record.port}/v1/health`);
    expect(health401.status).toBe(401);
    // Same live pid (this process), wrong token: the probe, not the pid, decides.
    await writeDaemonRecord({ ...record, token: "wrong" }, env);
    expect((await daemonHealth({ env })).kind).not.toBe("ok");
    await writeDaemonRecord(record, env);
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

  it("readiness waits for the first index, at most 3 s", async () => {
    await start();
    const ready = await daemonReady({ root: repo, waitMs: 2_500, env });
    expect(ready).toEqual({
      kind: "ok",
      value: expect.objectContaining({ ready: true, state: "fresh" }),
    });
    expect(MAX_READY_WAIT_MS).toBe(3_000);
  });

  it("readiness answers not-ready, never an error, when the index is still building", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = await startDaemon({
      buildId: "slow",
      tools: TOOLS,
      env,
      timers: false,
      log: () => undefined,
      openWorkspace: (root) => {
        const opened = Prism.create().openRepository(root);
        if (!opened.ok) return opened;
        const workspace = opened.value;
        const index = workspace.index.bind(workspace);
        workspace.index = async (...args) => {
          await gate;
          return index(...args);
        };
        return ok(workspace);
      },
    });
    if (started.kind === "started") close = started.close;
    const ready = await daemonReady({ root: repo, waitMs: 100, env });
    expect(ready).toEqual({
      kind: "ok",
      value: expect.objectContaining({ ready: false, state: "indexing" }),
    });
    release();
  });

  it("serves internal routes: workspace routes after the index, root routes at once", async () => {
    await start();
    const receipt = await callDaemonRoute({
      path: "/v1/receipt",
      root: repo,
      args: { sessionId: "s" },
      env,
    });
    expect(receipt).toEqual({
      kind: "ok",
      value: { workspaceRoot: repo, args: { sessionId: "s", root: repo } },
    });
    const session = await callDaemonRoute({
      path: "/v1/session",
      root: repo,
      env,
    });
    expect(session).toEqual({
      kind: "ok",
      value: { root: repo, at: "session" },
    });
  });
});

describe("build skew (plan §10 Phase 4)", () => {
  it("orders versions by semver with prereleases below the release", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("2.0.0-rc.1", "2.0.0")).toBe(-1);
    expect(compareVersions("2.0.0-rc.2", "2.0.0-rc.10")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("orders build ids by version, then by build stamp", () => {
    expect(compareBuildIds("2.0.0+200", "2.0.0+100")).toBe(1);
    expect(compareBuildIds("1.9.0+999", "2.0.0+1")).toBe(-1);
    expect(compareBuildIds("2.0.0+5", "2.0.0+5")).toBe(0);
  });

  it("an older client leaves a newer daemon running and falls back", async () => {
    await start("2.0.0+200");
    const outcome = await ensureDaemon({
      command: process.execPath,
      args: ["-e", "process.exit(1)"],
      env,
      buildId: "2.0.0+100",
      waitMs: 0,
    });
    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "daemon is from a newer build (2.0.0+200)",
    });
    const health = await daemonHealth({ env });
    expect(health.kind === "ok" && health.value.buildId).toBe("2.0.0+200");
  });
});
