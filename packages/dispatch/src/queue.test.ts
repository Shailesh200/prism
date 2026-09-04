import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveConfig } from "./config.js";
import { dispatchAndDrain, drain } from "./drain-harness.js";
import { settleDrains } from "./queue.js";
import {
  activeJobCount,
  deleteJob,
  loadJobs,
  queuedJobs,
  upsertJob,
} from "./jobs.js";
import { jobsPath } from "./paths.js";
import { createDispatchRuntime } from "./runtime.js";
import type { GitRunner } from "./git.js";
import type { JobRecord } from "./types.js";
import type { WorkerPort } from "./worker.js";

let root: string | undefined;

afterEach(async () => {
  // `start_job` kicks a drain it does not await, so a fixture removed too
  // eagerly races a write that is still in flight.
  await settleDrains();
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "prism-dispatch-queue-"));
}

const git: GitRunner = async (_cwd, args) => {
  if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
    return { ok: true, stdout: "main\n", stderr: "" };
  }
  return { ok: true, stdout: "", stderr: "" };
};

function recordingWorker(calls: string[]): WorkerPort {
  return {
    async start(input) {
      calls.push(input.jobId);
      return { pid: process.pid };
    },
    async resume() {
      return { pid: process.pid };
    },
    async cancel() {},
    async status() {
      return { status: "running", detail: "" };
    },
  };
}

function baseJob(patch: Partial<JobRecord>): JobRecord {
  const now = new Date().toISOString();
  return {
    id: "j1",
    title: "job one",
    playbook: "ticket",
    prd: "",
    branch: "main",
    worktreePath: "",
    source: "checkout",
    status: "queued",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

describe("start_job accepts and returns (ADR-0047)", () => {
  it("returns a queued job before any worker exists", async () => {
    root = await tempRoot();
    const calls: string[] = [];
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: recordingWorker(calls),
      env: { CURSOR_API_KEY: "k" },
    });
    const accepted = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
    })) as { job: JobRecord; message: string };

    expect(accepted.job.status).toBe("queued");
    expect(accepted.job.queuedAt).toBeTruthy();
    expect(accepted.job.startedAt).toBeUndefined();
    expect(accepted.job.finishedAt).toBeUndefined();
    expect(accepted.message).toMatch(/queued/i);
    // The reply cannot claim work has begun, because it has not.
    expect(accepted.message).not.toMatch(/^Started/);
  });

  it("stays inside the 500ms latency budget even when sign-in is slow", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: recordingWorker([]),
      env: {},
      cursorAuth: {
        async status() {
          // The exact failure mode the budget exists for: a login that can
          // take 180 seconds used to run before start_job returned.
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          return { kind: "stored", email: "dev@prism.test" };
        },
        async login() {
          throw new Error("should not be reached");
        },
      },
    });
    const began = Date.now();
    await runtime.handle("start_job", { title: "slow auth", jobId: "slow" });
    expect(Date.now() - began).toBeLessThan(500);
  });

  it("is idempotent: re-asking for a queued job does not duplicate it", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      env: { CURSOR_API_KEY: "k" },
    });
    await runtime.handle("start_job", { title: "twice", jobId: "twice" });
    const again = (await runtime.handle("start_job", {
      title: "twice",
      jobId: "twice",
    })) as { message: string };
    expect(again.message).toMatch(/already in the queue/i);
    expect(await loadJobs(root)).toHaveLength(1);
  });

  it("re-queueing a cancelled slug stays queued, not immediately cancelled", async () => {
    root = await tempRoot();
    const { writeRunState, reapJobs } = await import("./run-state.js");
    await upsertJob(
      root,
      baseJob({
        id: "test-coverage-check",
        title: "Test coverage check",
        status: "cancelled",
        lastActivity: "Cancelled",
        queuedAt: "2026-09-04T00:00:00.000Z",
      }),
    );
    await writeRunState(root, "test-coverage-check", {
      jobId: "test-coverage-check",
      phase: "cancelled",
      lastActivity: "Cancelled",
      resultSummary: "",
      errorMessage: "",
      gitSummary: "",
      startedAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:01.000Z",
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      env: { CURSOR_API_KEY: "k" },
    });
    const accepted = (await runtime.handle("start_job", {
      title: "Test coverage check",
      jobId: "test-coverage-check",
    })) as { job: JobRecord };
    expect(accepted.job.status).toBe("queued");
    const afterReap = await reapJobs(root);
    const status = afterReap.find(
      (row) => row.id === "test-coverage-check",
    )?.status;
    expect(status).not.toBe("cancelled");
  });
});

describe("the drain starts queued work", () => {
  it("moves queued to running and stamps startedAt only then", async () => {
    root = await tempRoot();
    const calls: string[] = [];
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: recordingWorker(calls),
      env: { CURSOR_API_KEY: "k" },
    });
    const result = await dispatchAndDrain(runtime, {
      title: "fix login",
      jobId: "fix-login",
    });
    expect(result.job?.status).toBe("running");
    expect(result.job?.startedAt).toBeTruthy();
    expect(calls).toEqual(["fix-login"]);
    // Queue time is charged to the pipeline, not to the agent.
    expect(Date.parse(result.job!.startedAt!)).toBeGreaterThanOrEqual(
      Date.parse(result.job!.queuedAt!),
    );
  });

  it("queues past the cap instead of refusing, then starts when a slot frees", async () => {
    root = await tempRoot();
    await saveConfig(root, { maxJobs: 1, placement: "worktree" });
    const calls: string[] = [];
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: recordingWorker(calls),
      env: { CURSOR_API_KEY: "k" },
    });
    await dispatchAndDrain(runtime, { title: "one", jobId: "one" });
    const second = await dispatchAndDrain(runtime, {
      title: "two",
      jobId: "two",
    });
    expect(second.job?.status).toBe("queued");
    expect(calls).toEqual(["one"]);

    await runtime.handle("job_control", { jobId: "one", action: "cancel" });
    const after = await drain(runtime);
    expect(after.find((row) => row.id === "two")?.status).toBe("running");
    expect(calls).toEqual(["one", "two"]);
  });

  it("does not count queued work against the cap", () => {
    const jobs = [
      baseJob({ id: "a", status: "queued" }),
      baseJob({ id: "b", status: "needs_confirm" }),
      baseJob({ id: "c", status: "ready" }),
      baseJob({ id: "d", status: "running" }),
    ];
    // Only the job with a live worker occupies a slot. `ready` counting was
    // what refused job #2 while job #1 was still signing in.
    expect(activeJobCount(jobs)).toBe(1);
  });

  it("drains oldest first so the queue is fair", () => {
    const jobs = [
      baseJob({
        id: "late",
        status: "queued",
        queuedAt: "2026-09-02T10:05:00Z",
      }),
      baseJob({
        id: "early",
        status: "queued",
        queuedAt: "2026-09-02T10:00:00Z",
      }),
    ];
    expect(queuedJobs(jobs).map((row) => row.id)).toEqual(["early", "late"]);
  });
});

describe("sign-in unblocks the queue", () => {
  it("init re-queues auth-blocked jobs instead of asking for a manual resume", async () => {
    root = await tempRoot();
    let signedIn = false;
    const calls: string[] = [];
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: recordingWorker(calls),
      env: {},
      cursorAuth: {
        async status() {
          return signedIn
            ? { kind: "stored", email: "dev@prism.test" }
            : { kind: "missing" };
        },
        async login() {
          if (!signedIn) throw new Error("browser login declined");
          return { apiKey: "minted", expiresAtMs: Date.now() + 1_000 };
        },
      },
    });

    const blocked = await dispatchAndDrain(runtime, {
      title: "needs auth",
      jobId: "needs-auth",
    });
    expect(blocked.job?.status).toBe("blocked");
    expect(blocked.job?.waitingOn).toBe("worker-auth");
    expect(calls).toEqual([]);

    signedIn = true;
    const init = (await runtime.handle("init", {})) as {
      ready: boolean;
      requeued: number;
    };
    expect(init.ready).toBe(true);
    expect(init.requeued).toBe(1);

    const after = await drain(runtime);
    expect(after.find((row) => row.id === "needs-auth")?.status).toBe(
      "running",
    );
    expect(calls).toEqual(["needs-auth"]);
  });
});

describe("the clock", () => {
  it("stamps finishedAt on a terminal status and clears it on resume", async () => {
    root = await tempRoot();
    const job = await upsertJob(root, baseJob({ id: "t1", status: "running" }));
    expect(job.finishedAt).toBeUndefined();

    const done = await upsertJob(root, { ...job, status: "done" });
    expect(done.finishedAt).toBeTruthy();

    const restarted = await upsertJob(root, { ...done, status: "running" });
    expect(restarted.finishedAt).toBeUndefined();
  });

  it("stops the clock for a paused job, which has no worker burning time", async () => {
    root = await tempRoot();
    const running = await upsertJob(
      root,
      baseJob({ id: "p1", status: "running" }),
    );
    const paused = await upsertJob(root, { ...running, status: "paused" });
    expect(paused.finishedAt).toBeTruthy();
  });
});

describe("jobs.json durability", () => {
  it("never leaves a half-written file for a concurrent reader", async () => {
    root = await tempRoot();
    // Twenty interleaved writers, each a read-modify-write of the same file.
    // With a direct `writeFile` the truncate/fill window lets a reader see an
    // empty file and conclude there are no jobs.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        upsertJob(root!, baseJob({ id: `job-${i}`, title: `job ${i}` })),
      ),
    );
    const raw = await readFile(jobsPath(root), "utf8");
    expect(() => JSON.parse(raw) as unknown).not.toThrow();
    expect((await loadJobs(root)).length).toBeGreaterThan(0);
  });

  it("leaves no temp files behind", async () => {
    root = await tempRoot();
    await upsertJob(root, baseJob({ id: "only" }));
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(join(root, ".prism", "dispatch"));
    expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("deleteJob removes a finished record from the board", async () => {
    root = await tempRoot();
    await upsertJob(root, baseJob({ id: "latency-check", status: "error" }));
    const removed = await deleteJob(root, "latency-check");
    expect(removed?.id).toBe("latency-check");
    expect(await loadJobs(root)).toEqual([]);
  });
});
