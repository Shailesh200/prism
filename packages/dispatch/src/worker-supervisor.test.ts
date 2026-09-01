import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCursorWorkerPort } from "./worker.js";
import { isProcessAlive, readRunState } from "./run-state.js";
import { continueWorkerRun, pauseWorkerRun } from "./worker-spawn.js";

const STUB = `import { readFile, unlink, writeFile } from "node:fs/promises";
const payload = JSON.parse(await readFile(process.argv[2], "utf8"));
await unlink(process.argv[2]);
const now = new Date().toISOString();
await writeFile(
  payload.runPath,
  JSON.stringify({
    jobId: payload.jobId,
    pid: process.pid,
    phase: "running",
    lastActivity: "Using blast_radius",
    resultSummary: "",
    errorMessage: "",
    gitSummary: "",
    startedAt: now,
    updatedAt: now,
  }),
);
await new Promise(() => {});
`;

async function waitFor(fn: () => Promise<boolean>, ms = 4_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("timed out waiting for worker child");
}

describe("out-of-process worker supervisor", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("spawns a child, records live activity, and kills it on cancel", async () => {
    root = await mkdtemp(join(tmpdir(), "prism-worker-"));
    const childPath = join(root, "stub-child.mjs");
    await writeFile(childPath, STUB);
    const port = createCursorWorkerPort({ childPath });
    const started = await port.start({
      jobId: "audit-issues",
      cwd: root,
      workspaceRoot: root,
      prompt: "audit",
      mcpCommand: "node",
      mcpArgs: ["bin.js"],
    });
    expect(started.pid).toBeDefined();
    expect(isProcessAlive(started.pid)).toBe(true);

    await waitFor(async () => {
      const run = await readRunState(root, "audit-issues");
      return run?.lastActivity === "Using blast_radius";
    });

    const live = await port.status({
      jobId: "audit-issues",
      cwd: root,
      workspaceRoot: root,
    });
    expect(live.status).toBe("running");
    expect(live.detail).toBe("Using blast_radius");

    const pid = started.pid;
    if (pid == null) throw new Error("expected worker pid");
    await port.cancel({
      jobId: "audit-issues",
      cwd: root,
      workspaceRoot: root,
      pid,
    });
    await waitFor(async () => !isProcessAlive(pid), 5_000);
    const run = await readRunState(root, "audit-issues");
    expect(run?.phase).toBe("cancelled");
  });

  it("freezes the child on pause and continues it on resume", async () => {
    root = await mkdtemp(join(tmpdir(), "prism-worker-"));
    const childPath = join(root, "tick-child.mjs");
    await writeFile(
      childPath,
      `import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
const payload = JSON.parse(await readFile(process.argv[2], "utf8"));
await unlink(process.argv[2]);
const tickPath = join(payload.cwd, "ticks");
let n = 0;
const now = new Date().toISOString();
await writeFile(
  payload.runPath,
  JSON.stringify({
    jobId: payload.jobId,
    pid: process.pid,
    phase: "running",
    lastActivity: "Ticking",
    resultSummary: "",
    errorMessage: "",
    gitSummary: "",
    startedAt: now,
    updatedAt: now,
  }),
);
setInterval(() => {
  n += 1;
  void writeFile(tickPath, String(n));
}, 40);
await new Promise(() => {});
`,
    );
    const port = createCursorWorkerPort({ childPath });
    const started = await port.start({
      jobId: "audit-issues",
      cwd: root,
      workspaceRoot: root,
      prompt: "audit",
      mcpCommand: "node",
      mcpArgs: ["bin.js"],
    });
    const pid = started.pid;
    if (pid == null) throw new Error("expected worker pid");
    const ticksPath = join(root, "ticks");
    await waitFor(async () => {
      try {
        return Number(await readFile(ticksPath, "utf8")) >= 2;
      } catch {
        return false;
      }
    });

    const paused = await pauseWorkerRun({
      pid,
      workspaceRoot: root,
      jobId: "audit-issues",
    });
    expect(paused.mode).toBe("frozen");
    expect(isProcessAlive(pid)).toBe(true);
    const frozenAt = Number(await readFile(ticksPath, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(Number(await readFile(ticksPath, "utf8"))).toBe(frozenAt);

    const continued = await continueWorkerRun({
      pid,
      workspaceRoot: root,
      jobId: "audit-issues",
    });
    expect(continued.continued).toBe(true);
    await waitFor(
      async () => Number(await readFile(ticksPath, "utf8")) > frozenAt,
    );

    await port.cancel({
      jobId: "audit-issues",
      cwd: root,
      workspaceRoot: root,
      pid,
    });
    await waitFor(async () => !isProcessAlive(pid), 5_000);
  });
});
