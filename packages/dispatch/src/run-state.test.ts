import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  activityFromEvent,
  applyRunToJob,
  composeResultSummary,
  isProcessAlive,
  reapJobs,
} from "./run-state.js";
import { upsertJob, loadJobs } from "./jobs.js";
import {
  workerMcpEnv,
  mcpArgsWithWorkspace,
  cursorAgentOptions,
} from "./worker-options.js";
import { gitChangeSummary, type GitRunner } from "./git.js";
import type { JobRecord } from "./types.js";

function job(patch: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "audit-issues",
    title: "Audit issues",
    playbook: "ticket",
    prd: "",
    branch: "dispatch/audit-issues",
    worktreePath: "/tmp/tree",
    source: "prism",
    status: "running",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...patch,
  };
}

describe("activityFromEvent", () => {
  it("maps tool calls and assistant text", () => {
    expect(
      activityFromEvent({ type: "tool_call", name: "blast_radius" }),
    ).toEqual({ phase: "tool", lastActivity: "Using blast_radius" });
    expect(activityFromEvent({ type: "thinking" })?.lastActivity).toBe(
      "Thinking",
    );
    expect(
      activityFromEvent({
        type: "assistant",
        message: { content: [{ type: "text", text: "Slimming the runner" }] },
      })?.lastActivity,
    ).toContain("Slimming the runner");
  });
});

describe("applyRunToJob", () => {
  it("copies live activity from the sidecar", () => {
    const next = applyRunToJob(job(), {
      jobId: "audit-issues",
      pid: process.pid,
      phase: "tool",
      lastActivity: "Using blast_radius",
      resultSummary: "",
      errorMessage: "",
      gitSummary: "",
      startedAt: "t",
      updatedAt: "t",
    });
    expect(next.status).toBe("running");
    expect(next.lastActivity).toBe("Using blast_radius");
    expect(next.workerPid).toBe(process.pid);
  });

  it("copies the worker model from the sidecar", () => {
    const next = applyRunToJob(job(), {
      jobId: "audit-issues",
      pid: process.pid,
      phase: "running",
      lastActivity: "Teammate is on it",
      resultSummary: "",
      errorMessage: "",
      gitSummary: "",
      model: "claude-sonnet-4-5",
      thinking: "10000",
      startedAt: "t",
      updatedAt: "t",
    });
    expect(next.workerModel).toBe("claude-sonnet-4-5");
    expect(next.workerThinking).toBe("10000");
  });

  it("marks a dead pid as a user-safe error", () => {
    const next = applyRunToJob(job({ workerPid: 99999999 }), undefined);
    expect(next.status).toBe("error");
    expect(next.errorMessage).toMatch(/stopped unexpectedly/i);
    expect(next.errorMessage).not.toMatch(/API key|pid|mcp\.json/i);
  });

  it("keeps a mock in-process job running when it has no pid yet", () => {
    const next = applyRunToJob(job({ workerPid: undefined }), undefined);
    expect(next.status).toBe("running");
  });

  it("reaps a legacy running job with no pid after it goes stale", () => {
    const next = applyRunToJob(
      job({
        workerPid: undefined,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      }),
      undefined,
    );
    expect(next.status).toBe("error");
  });

  it("records a finished result", () => {
    const next = applyRunToJob(job(), {
      jobId: "audit-issues",
      phase: "done",
      lastActivity: "Done",
      resultSummary: "3 files changed. Slimmed the lighthouse runner.",
      errorMessage: "",
      gitSummary: "3 files changed",
      startedAt: "t",
      updatedAt: "t",
      completedAt: "t",
    });
    expect(next.status).toBe("done");
    expect(next.resultSummary).toMatch(/lighthouse/);
  });

  it("copies notes and cited-missing paths from a finished sidecar", () => {
    const next = applyRunToJob(job(), {
      jobId: "audit-issues",
      phase: "done",
      lastActivity: "Done",
      resultSummary: "I wrote the findings to `.prism/dispatch/notes/a.md`.",
      errorMessage: "",
      gitSummary: "",
      notes: [".prism/dispatch/notes/a.md"],
      citedMissing: ["lib/gsap.ts", "src/x.ts"],
      startedAt: "t",
      updatedAt: "t",
      completedAt: "t",
    });
    expect(next.notes).toEqual([".prism/dispatch/notes/a.md"]);
    expect(next.citedMissing).toEqual(["lib/gsap.ts", "src/x.ts"]);
  });

  it("does not reap a newly queued job from a leftover cancelled sidecar", () => {
    const next = applyRunToJob(
      job({
        status: "queued",
        queuedAt: "2026-09-04T00:02:00.000Z",
        lastActivity: "Queued",
        workerPid: undefined,
        branch: "",
        worktreePath: "",
      }),
      {
        jobId: "audit-issues",
        phase: "cancelled",
        lastActivity: "Cancelled",
        resultSummary: "",
        errorMessage: "",
        gitSummary: "",
        startedAt: "2026-09-04T00:00:00.000Z",
        updatedAt: "2026-09-04T00:01:00.000Z",
      },
    );
    expect(next.status).toBe("queued");
    expect(next.lastActivity).toBe("Queued");
  });
});

describe("composeResultSummary", () => {
  it("joins git + assistant text", () => {
    expect(
      composeResultSummary("3 files changed", "Slimmed the lighthouse runner."),
    ).toMatch(/3 files changed.*lighthouse/);
  });
});

describe("isProcessAlive", () => {
  it("detects this process and rejects garbage pids", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(99999999)).toBe(false);
    expect(isProcessAlive(undefined)).toBe(false);
  });
});

describe("reapJobs", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("persists a dead-pid failure onto the job record", async () => {
    root = await mkdtemp(join(tmpdir(), "prism-reap-"));
    await upsertJob(root, job({ workerPid: 99999999, status: "running" }));
    const next = await reapJobs(root);
    expect(next[0]?.status).toBe("error");
    expect((await loadJobs(root))[0]?.errorMessage).toMatch(
      /stopped unexpectedly/i,
    );
  });
});

describe("worker MCP env", () => {
  it("points the worker's Prism at the host checkout, not its worktree", () => {
    expect(workerMcpEnv("/host/repo")).toEqual({
      PRISM_DISPATCH_ROLE: "worker",
      PRISM_WORKSPACE: "/host/repo",
    });
    expect(mcpArgsWithWorkspace(["/bin/prism-mcp"], "/host/repo")).toEqual([
      "/bin/prism-mcp",
      "--workspace",
      "/host/repo",
    ]);
    const options = cursorAgentOptions({
      cwd: "/host/repo/.prism/dispatch/worktrees/audit-issues",
      workspaceRoot: "/host/repo",
      mcpCommand: "node",
      mcpArgs: ["/mcp/bin.js"],
      name: "Prism · Audit",
    });
    expect(options.local).toMatchObject({
      cwd: "/host/repo/.prism/dispatch/worktrees/audit-issues",
    });
    // ADR-0050: a worker-role Prism, resolved against the host root because
    // that is the tree the Console indexes. Its worktree is not indexed, so
    // pointing it there would answer about a repository nobody is looking at.
    expect(options.mcpServers).toEqual({
      prism: {
        command: "node",
        args: ["/mcp/bin.js", "--workspace", "/host/repo"],
        env: { PRISM_DISPATCH_ROLE: "worker", PRISM_WORKSPACE: "/host/repo" },
      },
    });
    expect(options.tools).toEqual(
      expect.arrayContaining(["read", "edit", "grep", "mcp"]),
    );
    // The shell ban is untouched: it is what stopped a worker running `bun
    // install` and re-indexing (ADR-0041).
    expect(options.tools).not.toContain("shell");
  });
});

describe("gitChangeSummary", () => {
  it("speaks a count without the worktree path", async () => {
    const run: GitRunner = async (_cwd, args) => {
      if (args[0] === "diff") {
        return {
          ok: true,
          stdout: " packages/x.ts | 2 +\n 1 file changed, 2 insertions(+)\n",
          stderr: "",
        };
      }
      return { ok: true, stdout: " M packages/x.ts\n", stderr: "" };
    };
    const text = await gitChangeSummary("/secret/worktree", run);
    expect(text).toMatch(/1 file changed/);
    expect(text).not.toContain("/secret/worktree");
  });

  it("ignores a node_modules symlink as if nothing changed", async () => {
    const run: GitRunner = async (_cwd, args) => {
      if (args[0] === "diff") {
        return { ok: true, stdout: "", stderr: "" };
      }
      return { ok: true, stdout: "?? node_modules\n", stderr: "" };
    };
    expect(await gitChangeSummary("/secret/worktree", run)).toBe(
      "No file changes yet.",
    );
  });
});
