import { describe, expect, it } from "vitest";
import { gitReviewSummary, MAX_REVIEW_FILES, type GitRunner } from "./git.js";
import {
  analysisSpeak,
  reviewSpeak,
  listJobsSpeak,
  statusPhrase,
} from "./job-voice.js";
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
  nameStatus?: string;
  ok?: boolean;
}): GitRunner {
  return async (_cwd, args) => {
    const ok = files.ok ?? true;
    if (args.includes("--numstat")) {
      return { ok, stdout: files.numstat ?? "", stderr: "" };
    }
    if (args.includes("--name-status")) {
      return { ok, stdout: files.nameStatus ?? "", stderr: "" };
    }
    return { ok: true, stdout: "", stderr: "" };
  };
}

const BASE = { baseRef: "main", branch: "dispatch/rms-pagination" };

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

describe("review summary from the job branch", () => {
  it("reads churn from the commit range, not the dirty tree", async () => {
    const review = await gitReviewSummary(
      "/tmp/tree",
      BASE,
      runner({
        numstat: "11\t1\tsrc/table.ts\n4\t0\tsrc/new.ts\n",
        nameStatus: "M\tsrc/table.ts\nA\tsrc/new.ts\n",
      }),
    );

    expect(review.files.map((file) => file.path)).toEqual([
      "src/new.ts",
      "src/table.ts",
    ]);
    expect(review.totalAdded).toBe(15);
    expect(review.totalRemoved).toBe(1);
    expect(review.files.find((f) => f.path === "src/new.ts")?.change).toBe(
      "added",
    );
    // Committed by the supervisor (ADR-0042 §1), but never merged for the user.
    expect(review.committed).toBe(true);
    expect(review.merged).toBe(false);
    expect(review.branch).toBe("dispatch/rms-pagination");
    expect(review.baseRef).toBe("main");
  });

  it("marks deletions and renames", async () => {
    const review = await gitReviewSummary(
      "/tmp/tree",
      BASE,
      runner({
        numstat: "0\t9\tsrc/gone.ts\n2\t2\tnew.ts\n",
        nameStatus: "D\tsrc/gone.ts\nR100\told.ts\tnew.ts\n",
      }),
    );
    expect(review.files.find((f) => f.path === "src/gone.ts")?.change).toBe(
      "deleted",
    );
    expect(review.files.find((f) => f.path === "new.ts")?.change).toBe(
      "renamed",
    );
  });

  it("ignores node_modules noise", async () => {
    const review = await gitReviewSummary(
      "/tmp/tree",
      BASE,
      runner({
        numstat: "5\t0\tnode_modules/pkg/index.js\n2\t0\tsrc/real.ts\n",
      }),
    );
    expect(review.files.map((file) => file.path)).toEqual(["src/real.ts"]);
  });

  it("treats a binary file as zero churn rather than NaN", async () => {
    const review = await gitReviewSummary(
      "/tmp/tree",
      BASE,
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
      BASE,
      runner({ numstat: many }),
    );
    expect(review.files).toHaveLength(MAX_REVIEW_FILES);
    expect(review.truncated).toBe(true);
    expect(review.totalAdded).toBe(MAX_REVIEW_FILES + 10);
  });

  it("reports nothing reviewable when git cannot answer", async () => {
    const review = await gitReviewSummary(
      "/tmp/tree",
      BASE,
      runner({ ok: false }),
    );
    expect(review.files).toEqual([]);
    expect(review.committed).toBe(false);
  });
});

describe("a finished job asks before it lands", () => {
  const review: JobReview = {
    files: [
      { path: "src/table.ts", added: 11, removed: 1, change: "modified" },
      { path: "src/new.ts", added: 4, removed: 0, change: "added" },
    ],
    totalAdded: 15,
    totalRemoved: 1,
    truncated: false,
    branch: "dispatch/rms-pagination",
    baseRef: "main",
    committed: true,
    merged: false,
    mixedPaths: [],
  };

  it("moves a done job with work to needs_review", () => {
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

  it("does not bounce a kept review back to needs_review", () => {
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
    const kept: JobRecord = {
      ...baseJob,
      status: "done",
      review: {
        ...review,
        keptPaths: review.files.map((file) => file.path),
      },
    };
    const next = applyRunToJob(kept, run);
    expect(next.status).toBe("done");
    expect(next.review?.keptPaths).toEqual(
      review.files.map((file) => file.path),
    );
    expect(next.nextStep).toBe("");
  });

  it("still closes a job that produced no reviewable change", () => {
    const run: RunState = {
      jobId: baseJob.id,
      phase: "done",
      lastActivity: "Done",
      resultSummary: "",
      errorMessage: "",
      gitSummary: "produced no reviewable change",
      review: {
        files: [],
        totalAdded: 0,
        totalRemoved: 0,
        truncated: false,
        branch: "dispatch/rms-pagination",
        baseRef: "main",
        committed: false,
        merged: false,
        mixedPaths: [],
      },
      startedAt: baseJob.createdAt,
      updatedAt: new Date().toISOString(),
    };
    expect(applyRunToJob(baseJob, run).status).toBe("done");
  });

  it("names the files and branch, and asks before merging", () => {
    const text = reviewSpeak(baseJob, review);
    expect(text).toContain("src/table.ts +11 -1");
    expect(text).toContain("src/new.ts +4 -0 (added)");
    expect(text).toMatch(/\+15 -1/);
    expect(text).toContain("dispatch/rms-pagination");
    // The whole point: the user's branch is untouched and they are asked.
    expect(text).toMatch(/nothing has been merged/i);
    expect(text).toMatch(/merge it, leave it, or drop it/i);
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
    expect(text).toMatch(/nothing has been merged/i);
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

describe("analysisSpeak", () => {
  it("lifts thinking and edits out of the console noise", () => {
    const text = analysisSpeak([
      { phase: "starting", text: "Teammate starting" },
      { phase: "running", text: "Teammate is on it" },
      {
        phase: "thinking",
        text: "The repository is Prism. The brief said change nothing, so I will only print the name.",
      },
      { phase: "editing", text: "Using Edit on src/job.ts" },
      { phase: "done", text: "Done — 1 file(s) in your working tree" },
    ]);
    expect(text).toMatch(/Why it did that/);
    expect(text).toMatch(/change nothing/);
    expect(text).toMatch(/Files it touched/);
    expect(text).toMatch(/src\/job\.ts/);
    expect(text).not.toMatch(/Teammate starting/);
  });
});
