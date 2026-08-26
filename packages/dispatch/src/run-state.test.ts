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
  it("does not attach Prism MCP to the job agent", () => {
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
    expect(options.mcpServers).toEqual({});
    expect(options.tools).toEqual(
      expect.arrayContaining(["read", "edit", "grep"]),
    );
    expect(options.tools).not.toContain("shell");
    expect(options.tools).not.toContain("mcp");
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
