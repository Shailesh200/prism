import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveConfig } from "./config.js";
import { createDispatchRuntime } from "./runtime.js";
import { applyRunToJob, patchRunState } from "./run-state.js";
import type { GitRunner } from "./git.js";
import type { WorkerPort } from "./worker.js";
import type { ClaudeAuthPort } from "./claude-auth.js";
import type { CursorAuthPort } from "./cursor-auth.js";
import type { JobRecord } from "./types.js";

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "prism-dispatch-backend-"));
}

const git: GitRunner = async (_cwd, args) => {
  if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
    return { ok: true, stdout: "main\n", stderr: "" };
  }
  if (args[0] === "status") return { ok: true, stdout: "", stderr: "" };
  if (args[0] === "log")
    return { ok: true, stdout: "abc commit\n", stderr: "" };
  if (args[0] === "config" && args[1] === "user.name") {
    return { ok: true, stdout: "Test\n", stderr: "" };
  }
  if (args[0] === "rev-list") return { ok: true, stdout: "0\t1\n", stderr: "" };
  return { ok: true, stdout: "", stderr: "" };
};

function capturingWorker(tag: string, seen: { calls: string[] }): WorkerPort {
  return {
    async start(input) {
      seen.calls.push(`${tag}:start:${input.jobId}`);
      // A pid above every platform's pid_max, so isProcessAlive is false.
      return { pid: 99_999_999 };
    },
    async resume(input) {
      seen.calls.push(`${tag}:resume:${input.jobId}:${input.agentId ?? ""}`);
      return { pid: 99_999_999 };
    },
    async cancel() {
      seen.calls.push(`${tag}:cancel`);
    },
    async status() {
      return { status: "running", detail: "" };
    },
  };
}

const claudeSignedIn: ClaudeAuthPort = {
  async status() {
    return { kind: "stored" };
  },
};

const claudeSignedOut: ClaudeAuthPort = {
  async status() {
    return { kind: "missing", reason: "signin-missing" };
  },
};

const cursorSignedOut: CursorAuthPort = {
  async status() {
    return { kind: "missing" };
  },
  async login() {
    throw new Error("cursor login should not run for a claude backend");
  },
};

describe("worker backends (ADR-0044)", () => {
  it("runs jobs on the Claude worker for a claude-code host", async () => {
    root = await tempRoot();
    const seen = { calls: [] as string[] };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: capturingWorker("cursor", seen),
      claudeWorker: capturingWorker("claude", seen),
      claudeAuth: claudeSignedIn,
      cursorAuth: cursorSignedOut,
      env: {},
      getClientName: () => "claude-code",
    });
    const result = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
    })) as { job: { status: string; workerBackend?: string } };
    expect(result.job.status).toBe("running");
    expect(result.job.workerBackend).toBe("claude");
    expect(seen.calls).toEqual(["claude:start:fix-login"]);
  });

  it("keeps Cursor as the default backend", async () => {
    root = await tempRoot();
    const seen = { calls: [] as string[] };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: capturingWorker("cursor", seen),
      claudeWorker: capturingWorker("claude", seen),
      env: { CURSOR_API_KEY: "k" },
      getClientName: () => "cursor",
    });
    const result = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
    })) as { job: { status: string; workerBackend?: string } };
    expect(result.job.workerBackend).toBe("cursor");
    expect(seen.calls).toEqual(["cursor:start:fix-login"]);
  });

  it("lets configure pick the backend regardless of host", async () => {
    root = await tempRoot();
    await saveConfig(root, { workerBackend: "claude" });
    const seen = { calls: [] as string[] };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: capturingWorker("cursor", seen),
      claudeWorker: capturingWorker("claude", seen),
      claudeAuth: claudeSignedIn,
      env: {},
      getClientName: () => "cursor",
    });
    const result = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
    })) as { job: { status: string; workerBackend?: string } };
    expect(result.job.workerBackend).toBe("claude");
    expect(seen.calls).toEqual(["claude:start:fix-login"]);
  });

  it("blocks with the Claude sign-in steps, never a Cursor page", async () => {
    root = await tempRoot();
    const seen = { calls: [] as string[] };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: capturingWorker("cursor", seen),
      claudeWorker: capturingWorker("claude", seen),
      claudeAuth: claudeSignedOut,
      cursorAuth: cursorSignedOut,
      env: {},
      getClientName: () => "claude-code",
    });
    const result = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
    })) as { job: { status: string; waitingOn: string }; message: string };
    expect(result.job.status).toBe("blocked");
    expect(result.job.waitingOn).toBe("worker-auth");
    expect(result.message).toMatch(/run claude once in a terminal/i);
    expect(result.message).not.toMatch(/Cursor|API key|mcp\.json/i);
    expect(seen.calls).toEqual([]);
  });

  it("resumes a Claude job by its session id", async () => {
    root = await tempRoot();
    const seen = { calls: [] as string[] };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: capturingWorker("cursor", seen),
      claudeWorker: capturingWorker("claude", seen),
      claudeAuth: claudeSignedIn,
      env: {},
      getClientName: () => "claude-code",
    });
    await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
    });
    // The worker child reports its session id through the run sidecar; reap
    // maps it onto workerSessionId for claude jobs.
    await patchRunState(root, "fix-login", {
      agentId: "sess-42",
      phase: "failed",
      errorMessage: "boom",
      completedAt: new Date().toISOString(),
    });
    const resumed = (await runtime.handle("job_control", {
      jobId: "fix-login",
      action: "resume",
    })) as { job: { status: string } };
    expect(resumed.job.status).toBe("running");
    expect(seen.calls).toContain("claude:resume:fix-login:sess-42");
  });

  it("init speaks Claude steps for a claude host", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      claudeAuth: claudeSignedOut,
      env: {},
      getClientName: () => "claude-code",
    });
    const result = (await runtime.handle("init", {})) as {
      ready: boolean;
      message: string;
    };
    expect(result.ready).toBe(false);
    expect(result.message).toMatch(/run claude once in a terminal/i);
    expect(result.message).not.toMatch(/Cursor|API key/i);
  });

  it("doctor names the backend and skips Cursor checks for claude", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      claudeAuth: claudeSignedIn,
      env: {},
      fetchImpl: async () => new Response("nope", { status: 404 }),
      getClientName: () => "claude-code",
    });
    const result = (await runtime.handle("dispatch_doctor", {})) as {
      checks: { id: string; ok: boolean; detail: string }[];
    };
    const ids = result.checks.map((check) => check.id);
    expect(ids).toContain("worker_backend");
    expect(ids).toContain("claude_workers");
    expect(ids).not.toContain("cursor_sdk");
    expect(ids).not.toContain("cursor_workers");
    expect(
      result.checks.find((check) => check.id === "worker_backend")?.detail,
    ).toBe("Claude Code");
  });
});

describe("applyRunToJob backend mapping", () => {
  const baseJob: JobRecord = {
    id: "j1",
    title: "job",
    playbook: "ticket",
    prd: "",
    branch: "b",
    worktreePath: "/tmp/x",
    source: "prism",
    status: "running",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("maps run.agentId onto workerSessionId for claude jobs", () => {
    const next = applyRunToJob(
      { ...baseJob, workerBackend: "claude" },
      {
        jobId: "j1",
        phase: "running",
        lastActivity: "Working",
        resultSummary: "",
        errorMessage: "",
        gitSummary: "",
        agentId: "sess-9",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    );
    expect(next.workerSessionId).toBe("sess-9");
    expect(next.cursorAgentId).toBeUndefined();
  });

  it("keeps run.agentId on cursorAgentId for cursor jobs", () => {
    const next = applyRunToJob(baseJob, {
      jobId: "j1",
      phase: "running",
      lastActivity: "Working",
      resultSummary: "",
      errorMessage: "",
      gitSummary: "",
      agentId: "agent-9",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(next.cursorAgentId).toBe("agent-9");
    expect(next.workerSessionId).toBeUndefined();
  });
});
