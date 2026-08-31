import { describe, expect, it } from "vitest";
import { gitReviewSummary, MAX_REVIEW_FILES, type GitRunner } from "./git.js";
import { reviewSpeak, listJobsSpeak, statusPhrase } from "./job-voice.js";
import {
  applyRunToJob,
  formatStallDuration,
  isRunStalled,
  STALL_AFTER_MS,
  type RunState,
} from "./run-state.js";
import type { JobRecord, JobReview } from "./types.js";

function runner(files: {
  numstat?: string;
  status?: string;
  ok?: boolean;
}): GitRunner {
  return async (_cwd, args) => {
    if (args[0] === "diff" && args.includes("--numstat")) {
      return {
        ok: files.ok ?? true,
        stdout: files.numstat ?? "",
        stderr: "",
      };
    }
    if (args[0] === "status") {
      return { ok: files.ok ?? true, stdout: files.status ?? "", stderr: "" };
    }
    return { ok: true, stdout: "", stderr: "" };
  };
}

const baseJob: JobRecord = {
  id: "rms-pagination",
  title: "RMS pagination 100k+ cap",
  playbook: "ticket",
  prd: "",
  branch: "dispatch/rms-pagination",
  worktreePath: "/tmp/tree",
  source: "prism",
  status: "running",
  lastStep: "",
  nextStep: "",
  waitingOn: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("review summary from the worktree", () => {
  it("counts tracked churn and picks up untracked files", async () => {
    const review = await gitReviewSummary(
      "/tmp/tree",
      runner({
        numstat: "11\t1\tsrc/table.ts\n4\t0\tsrc/paginate.ts\n",
        status: " M src/table.ts\n?? src/new-file.ts\n",
      }),
    );

    expect(review.files.map((file) => file.path)).toEqual([
      "src/new-file.ts",
      "src/paginate.ts",
      "src/table.ts",
    ]);
    expect(review.totalAdded).toBe(15);
    expect(review.totalRemoved).toBe(1);
    expect(
      review.files.find((file) => file.path === "src/new-file.ts")?.change,
    ).toBe("untracked");
    expect(review.committed).toBe(false);
  });

  it("marks deletions and renames", async () => {
    const review = await gitReviewSummary(
      "/tmp/tree",
      runner({
        numstat: "0\t9\tsrc/gone.ts\n",
        status: " D src/gone.ts\nR  old.ts -> new.ts\n",
      }),
    );
    expect(review.files.find((f) => f.path === "src/gone.ts")?.change).toBe(
      "deleted",
    );
    expect(review.files.find((f) => f.path === "new.ts")?.change).toBe(
      "renamed",
    );
  });

  it("ignores node_modules and .prism noise", async () => {
    const review = await gitReviewSummary(
      "/tmp/tree",
      runner({
        numstat: "5\t0\tnode_modules/pkg/index.js\n2\t0\tsrc/real.ts\n",
        status: "?? .prism/dispatch/runs/x.json\n",
      }),
    );
    expect(review.files.map((file) => file.path)).toEqual(["src/real.ts"]);
  });

  it("treats a binary file as zero churn rather than NaN", async () => {
    const review = await gitReviewSummary(
      "/tmp/tree",
      runner({ numstat: "-\t-\tassets/logo.png\n" }),
    );
    expect(review.files[0]).toMatchObject({
      path: "assets/logo.png",
      added: 0,
      removed: 0,
    });
    expect(Number.isNaN(review.totalAdded)).toBe(false);
  });

  it("caps the file list and says it was capped", async () => {
    const many = Array.from(
      { length: MAX_REVIEW_FILES + 10 },
      (_, i) => `1\t0\tsrc/file-${String(i).padStart(3, "0")}.ts`,
    ).join("\n");
    const review = await gitReviewSummary(
      "/tmp/tree",
      runner({ numstat: many }),
    );
    expect(review.files).toHaveLength(MAX_REVIEW_FILES);
    expect(review.truncated).toBe(true);
    expect(review.totalAdded).toBe(MAX_REVIEW_FILES + 10);
  });

  it("returns an empty review when git cannot answer", async () => {
    const review = await gitReviewSummary("/tmp/tree", runner({ ok: false }));
    expect(review.files).toEqual([]);
    expect(review.totalAdded).toBe(0);
  });
});

describe("a finished job asks instead of committing", () => {
  const review: JobReview = {
    files: [
      { path: "src/table.ts", added: 11, removed: 1, change: "modified" },
      { path: "src/new.ts", added: 4, removed: 0, change: "untracked" },
    ],
    totalAdded: 15,
    totalRemoved: 1,
    truncated: false,
    committed: false,
  };

  it("moves a done job with edits to needs_review", () => {
    const run: RunState = {
      jobId: baseJob.id,
      phase: "done",
      lastActivity: "Done",
      resultSummary: "2 files changed",
      errorMessage: "",
      gitSummary: "2 files changed",
      review,
      startedAt: baseJob.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const next = applyRunToJob(baseJob, run);
    expect(next.status).toBe("needs_review");
    expect(next.review?.files).toHaveLength(2);
    expect(next.nextStep).toBe("review the changes");
  });

  it("still closes a job that changed nothing", () => {
    const run: RunState = {
      jobId: baseJob.id,
      phase: "done",
      lastActivity: "Done",
      resultSummary: "",
      errorMessage: "",
      gitSummary: "No file changes yet.",
      review: {
        files: [],
        totalAdded: 0,
        totalRemoved: 0,
        truncated: false,
        committed: false,
      },
      startedAt: baseJob.createdAt,
      updatedAt: new Date().toISOString(),
    };
    expect(applyRunToJob(baseJob, run).status).toBe("done");
  });

  it("names the files, says nothing was committed, and asks", () => {
    const text = reviewSpeak(baseJob, review);
    expect(text).toMatch(/2 files uncommitted/i);
    expect(text).toContain("src/table.ts +11 -1");
    expect(text).toContain("src/new.ts +4 -0 (untracked)");
    expect(text).toMatch(/\+15 -1/);
    expect(text).toMatch(/Nothing was committed/i);
    expect(text).toMatch(/commit these, keep them as they are, or discard/i);
  });

  it("speaks the review through the job list", () => {
    const text = listJobsSpeak([
      {
        id: baseJob.id,
        title: baseJob.title,
        status: "needs_review",
        agentStatus: "done",
        gitStatus: "clean",
        review,
      },
    ]);
    expect(text).toMatch(/Nothing was committed/i);
    expect(statusPhrase("needs_review")).toBe("ready for your review");
  });
});

describe("stalled jobs stop claiming progress", () => {
  const liveRun = (updatedAt: string): RunState => ({
    jobId: baseJob.id,
    pid: process.pid,
    phase: "thinking",
    lastActivity: "Thinking",
    resultSummary: "",
    errorMessage: "",
    gitSummary: "",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  });

  it("flags a live worker that has gone quiet", () => {
    const stale = new Date(Date.now() - STALL_AFTER_MS - 60_000).toISOString();
    expect(isRunStalled(liveRun(stale))).toBe(true);

    const next = applyRunToJob(
      { ...baseJob, workerPid: process.pid },
      liveRun(stale),
    );
    expect(next.status).toBe("waiting_on_you");
    expect(next.lastActivity).toMatch(/No activity for/);
    expect(next.waitingOn).toBe("stalled");
  });

  it("leaves a busy worker alone", () => {
    const fresh = new Date().toISOString();
    expect(isRunStalled(liveRun(fresh))).toBe(false);
    const next = applyRunToJob(
      { ...baseJob, workerPid: process.pid },
      liveRun(fresh),
    );
    expect(next.status).toBe("running");
  });

  it("does not flag a finished job", () => {
    const stale = new Date(Date.now() - STALL_AFTER_MS - 60_000).toISOString();
    expect(isRunStalled({ ...liveRun(stale), phase: "done" })).toBe(false);
  });

  it("reads a duration a human can act on", () => {
    expect(formatStallDuration(11 * 60_000)).toBe("11m");
    expect(formatStallDuration(64 * 60_000)).toBe("1h 4m");
    expect(formatStallDuration(120 * 60_000)).toBe("2h");
  });
});
