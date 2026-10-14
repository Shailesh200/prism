import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Prism, type PrismWorkspace } from "@repo-prism/core";
import { startDaemon } from "@repo-prism/daemon/server";
import type { PrismError, Result } from "@repo-prism/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { daemonBuildId } from "./daemon-attach.js";
import { daemonTools, debouncePerKey } from "./daemon.js";
import { autoPrepare } from "./safety/hook-command.js";
import { createPrismMcpServer } from "./server.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

let home: string;
let repo: string;
let stopDaemon: (() => Promise<void>) | undefined;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "prism-mcp-daemon-home-"));
  repo = await mkdtemp(join(tmpdir(), "prism-mcp-daemon-repo-"));
  await cp(FIXTURE, repo, {
    recursive: true,
    filter: (source) => !source.includes("/.prism"),
  });
});

afterEach(async () => {
  await stopDaemon?.();
  stopDaemon = undefined;
  await rm(home, { recursive: true, force: true });
  await rm(repo, { recursive: true, force: true });
});

async function startTestDaemon(env: NodeJS.ProcessEnv): Promise<void> {
  const started = await startDaemon({
    buildId: daemonBuildId(),
    tools: daemonTools(),
    env,
    timers: false,
    log: () => undefined,
  });
  if (started.kind !== "started") throw new Error("daemon did not start");
  stopDaemon = started.close;
}

async function connect(env: NodeJS.ProcessEnv) {
  let opens = 0;
  const built = createPrismMcpServer({
    workspaceRoot: repo,
    workspaceSource: "argument",
    workspaceLocked: true,
    env,
    openWorkspace: (root): Result<PrismWorkspace, PrismError> => {
      opens += 1;
      return Prism.create().openRepository(root);
    },
  });
  const client = new Client({ name: "daemon-test", version: "0.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    built.server.connect(serverSide),
    client.connect(clientSide),
  ]);
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as {
      content?: { text?: string }[];
      isError?: boolean;
    };
  return {
    call,
    opens: () => opens,
    close: async () => {
      await client.close();
      built.session.close();
    },
  };
}

describe("attach-first (M-095)", () => {
  it("answers from the daemon without indexing in-process, identically", async () => {
    const env = { ...process.env, PRISM_HOME: home, PRISM_DAEMON: "1" };
    await startTestDaemon(env);

    const attached = await connect(env);
    const viaDaemon = await attached.call("graph", {
      mode: "find",
      name: "renderDashboard",
    });
    expect(viaDaemon.isError).not.toBe(true);
    expect(attached.opens()).toBe(0);

    const local = await connect({ ...env, PRISM_DAEMON: "0" });
    const inProcess = await local.call("graph", {
      mode: "find",
      name: "renderDashboard",
    });
    expect(local.opens()).toBe(1);
    expect(viaDaemon.content?.[0]?.text).toBe(inProcess.content?.[0]?.text);

    await attached.close();
    await local.close();
  });

  it("falls back in-process when the daemon goes away mid-session", async () => {
    const env = { ...process.env, PRISM_HOME: home, PRISM_DAEMON: "1" };
    await startTestDaemon(env);
    const session = await connect(env);

    const before = await session.call("graph", {
      mode: "find",
      name: "renderDashboard",
    });
    await stopDaemon?.();
    stopDaemon = undefined;
    const after = await session.call("graph", {
      mode: "find",
      name: "renderDashboard",
    });

    expect(after.isError).not.toBe(true);
    expect(after.content?.[0]?.text).toBe(before.content?.[0]?.text);
    expect(session.opens()).toBe(1);
    await session.close();
  });

  it("passes tool errors through unchanged", async () => {
    const env = { ...process.env, PRISM_HOME: home, PRISM_DAEMON: "1" };
    await startTestDaemon(env);
    const session = await connect(env);
    const response = await session.call("graph", {
      mode: "explain",
      path: "../outside",
    });
    expect(response.isError).toBe(true);
    expect(session.opens()).toBe(0);
    await session.close();
  });
});

describe("auto-Prepare through the daemon", () => {
  it("uses the daemon's pack when it answers", async () => {
    const env = { ...process.env, PRISM_HOME: home, PRISM_DAEMON: "1" };
    await startTestDaemon(env);
    const output = await autoPrepare(
      { prompt: "fix renderDashboard so it shows the widget count" },
      { root: repo, env },
    );
    const context = (
      output.hookSpecificOutput as { additionalContext?: string } | undefined
    )?.additionalContext;
    expect(context).toContain("src/features/dashboard/Dashboard.ts");
  });
});

describe("debouncePerKey", () => {
  it("runs only the last task per key, once the key is quiet", async () => {
    const runs: string[] = [];
    const debounce = debouncePerKey(40);
    const task = (label: string) => async () => {
      runs.push(label);
    };
    debounce("a", task("first"));
    debounce("a", task("second"));
    debounce("b", task("other"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    debounce("a", task("third"));
    expect(runs).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(runs).toEqual(["other"]);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(runs).toEqual(["other", "third"]);
  });
});
