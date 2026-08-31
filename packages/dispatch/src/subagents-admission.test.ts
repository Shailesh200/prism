/**
 * Subagents, admission control, and worktree GC (ADR-0042 §4–§6).
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultGitRunner } from "./git.js";
import {
  admissionMessage,
  MIN_FREE_RAM_BYTES,
  PER_JOB_RESERVE_BYTES,
} from "./worker-budget.js";
import {
  cursorAgentOptions,
  workerTools,
  WORKER_EDIT_TOOLS,
  WORKER_SUBAGENT_TOOL,
} from "./worker-options.js";
import { pruneOrphanWorktrees } from "./worktrees.js";
import { DispatchConfigSchema } from "./types.js";
import { workerPrompt } from "./worker.js";
import type { JobRecord } from "./types.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("worker tool allowlist", () => {
  it("adds the task tool when subagents are on", () => {
    expect(workerTools(true)).toContain(WORKER_SUBAGENT_TOOL);
  });

  it("keeps subagents out when they are off", () => {
    expect(workerTools(false)).toEqual([...WORKER_EDIT_TOOLS]);
  });

  it("never grants shell or mcp, with or without subagents", () => {
    for (const tools of [workerTools(true), workerTools(false)]) {
      expect(tools).not.toContain("shell");
      expect(tools).not.toContain("mcp");
    }
  });

  it("attaches no MCP server to the agent", () => {
    const options = cursorAgentOptions({
      cwd: "/tmp/wt",
      workspaceRoot: "/tmp/repo",
      mcpCommand: "node",
      mcpArgs: [],
      subagents: true,
    });
    expect(options.mcpServers).toEqual({});
    expect(options.tools).toContain("task");
  });
});

function job(): JobRecord {
  return {
    id: "AI-1",
    title: "T",
    playbook: "ticket",
    prd: "",
    branch: "dispatch/ai-1",
    worktreePath: "/tmp/wt",
    source: "prism",
    status: "running",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: "",
    updatedAt: "",
  };
}

describe("worker prompt", () => {
  it("tells the worker Prism commits and verifies, not it", () => {
    const prompt = workerPrompt({ job: job(), memories: [] });
    expect(prompt).toMatch(/Prism commits your work/);
    expect(prompt).toMatch(/Do not claim you committed/);
  });

  it("points write-ups at the one artifact path that ships", () => {
    const prompt = workerPrompt({ job: job(), memories: [] });
    expect(prompt).toContain(".prism/dispatch/notes/");
  });

  it("mentions subagents only when they are enabled", () => {
    expect(workerPrompt({ job: job(), memories: [], subagents: true })).toMatch(
      /task tool/,
    );
    expect(
      workerPrompt({ job: job(), memories: [], subagents: false }),
    ).not.toMatch(/task tool/);
  });
});

describe("admissionMessage", () => {
  const roomy = MIN_FREE_RAM_BYTES + PER_JOB_RESERVE_BYTES + 1;

  it("admits the first job without consulting memory", () => {
    expect(
      admissionMessage({ activeCount: 0, maxJobs: 4, freeBytes: 1 }),
    ).toBeUndefined();
  });

  it("admits a second job when there is headroom", () => {
    expect(
      admissionMessage({ activeCount: 1, maxJobs: 4, freeBytes: roomy }),
    ).toBeUndefined();
  });

  it("refuses a second job when memory is tight", () => {
    const message = admissionMessage({
      activeCount: 1,
      maxJobs: 4,
      freeBytes: MIN_FREE_RAM_BYTES,
    });
    expect(message).toMatch(/already running/);
  });

  it("still honours an explicit cap", () => {
    expect(
      admissionMessage({ activeCount: 2, maxJobs: 2, freeBytes: roomy }),
    ).toMatch(/job cap \(2\)/);
  });
});

describe("dispatch config defaults", () => {
  it("enables in-process subagents and verification, not host fan-out", () => {
    const config = DispatchConfigSchema.parse({});
    expect(config.subagents).toBe(true);
    expect(config.verifyJobs).toBe(true);
    expect(config.fanout).toBe(false);
  });

  it("no longer caps parallel work at one teammate", () => {
    expect(DispatchConfigSchema.parse({}).maxJobs).toBeGreaterThan(1);
  });
});

describe("pruneOrphanWorktrees", { timeout: 30_000 }, () => {
  async function repoWithWorktree(commitInTree: boolean): Promise<{
    root: string;
    jobId: string;
  }> {
    const root = await mkdtemp(join(tmpdir(), "prism-gc-"));
    temps.push(root);
    const run = defaultGitRunner;
    await run(root, ["init", "-b", "main"]);
    await run(root, ["config", "user.email", "t@example.com"]);
    await run(root, ["config", "user.name", "Test"]);
    await writeFile(join(root, "seed.txt"), "seed\n");
    await run(root, ["add", "-A"]);
    await run(root, ["commit", "-m", "seed"]);

    const jobId = "gone-job";
    const path = join(root, ".prism", "dispatch", "worktrees", jobId);
    await run(root, ["worktree", "add", "-b", `dispatch/${jobId}`, path]);
    if (commitInTree) {
      await writeFile(join(path, "work.txt"), "real work\n");
      await run(path, ["add", "-A"]);
      await run(path, [
        "-c",
        "user.email=t@example.com",
        "-c",
        "user.name=Test",
        "commit",
        "-m",
        "work",
      ]);
    }
    return { root, jobId };
  }

  it("removes a worktree whose job record is gone and holds nothing", async () => {
    const { root, jobId } = await repoWithWorktree(false);

    const pruned = await pruneOrphanWorktrees({
      workspaceRoot: root,
      liveJobIds: new Set(),
      baseRef: "main",
    });

    expect(pruned.removed).toContain(jobId);
  });

  it("keeps a worktree that still holds unmerged commits", async () => {
    const { root, jobId } = await repoWithWorktree(true);

    const pruned = await pruneOrphanWorktrees({
      workspaceRoot: root,
      liveJobIds: new Set(),
      baseRef: "main",
    });

    expect(pruned.keptWithCommits).toContain(jobId);
    expect(pruned.removed).not.toContain(jobId);
  });

  it("never touches a worktree with a live job", async () => {
    const { root, jobId } = await repoWithWorktree(false);

    const pruned = await pruneOrphanWorktrees({
      workspaceRoot: root,
      liveJobIds: new Set([jobId]),
      baseRef: "main",
    });

    expect(pruned.removed).toEqual([]);
  });
});
