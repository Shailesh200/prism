import { describe, expect, it } from "vitest";
import { snapshotKey, toSnapshot } from "./snapshot.js";
import type { JobRecord, JobReview } from "@repo-prism/dispatch";

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
};

const job: JobRecord = {
  id: "rms-pagination",
  title: "RMS pagination 100k+ cap",
  playbook: "ticket",
  prd: "",
  branch: "dispatch/rms-pagination",
  worktreePath: "/tmp/tree",
  source: "prism",
  status: "needs_review",
  lastStep: "",
  nextStep: "review the changes",
  waitingOn: "",
  review,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:10:00.000Z",
};

describe("job snapshot", () => {
  it("carries the review so the board can show what changed", () => {
    // Without this the board reported a finished job and nothing about it.
    const snap = toSnapshot(job, "/repo");
    expect(snap.review?.files).toHaveLength(2);
    expect(snap.review?.totalAdded).toBe(15);
    expect(snap.review?.branch).toBe("dispatch/rms-pagination");
    expect(snap.nextStep).toBe("review the changes");
  });

  // ADR-0039 bans worktree paths from *spoken* copy. ADR-0048 amends that for
  // the board: a job detail is exactly where someone needs the path, because
  // they are trying to go open the branch. So it travels in its own field —
  // and nowhere a voice surface reads from.
  it("carries the worktree path for the board to show on the detail", () => {
    expect(toSnapshot(job, "/repo").worktreePath).toBe("/tmp/tree");
  });

  it("keeps the path out of every field chat and the statusline read", () => {
    const snap = toSnapshot(job, "/repo");
    const { worktreePath: _detailOnly, ...spoken } = snap;
    expect(JSON.stringify(spoken)).not.toContain("/tmp/tree");
  });

  it("carries the worker backend for the board", () => {
    const snap = toSnapshot(
      {
        ...job,
        workerBackend: "claude",
        workerModel: "claude-sonnet-4-5",
        workerThinking: "adaptive",
        notes: [".prism/dispatch/notes/a.md"],
        citedMissing: ["lib/gsap.ts"],
      },
      "/repo",
    );
    expect(snap.workerBackend).toBe("claude");
    expect(snap.workerModel).toBe("claude-sonnet-4-5");
    expect(snap.workerThinking).toBe("adaptive");
    expect(snap.notes).toEqual([".prism/dispatch/notes/a.md"]);
    expect(snap.citedMissing).toEqual(["lib/gsap.ts"]);
  });

  it("carries token usage so Focus can show live then final totals", () => {
    const snap = toSnapshot(
      {
        ...job,
        tokenUsage: {
          inputTokens: 1_200,
          outputTokens: 80,
          contextTokens: 48_000,
          contextWindow: 200_000,
        },
      },
      "/repo",
    );
    expect(snap.tokenUsage?.inputTokens).toBe(1_200);
    expect(snap.tokenUsage?.contextWindow).toBe(200_000);
  });

  it("omits review for a job that has none", () => {
    const { review: _drop, ...bare } = job;
    const snap = toSnapshot(bare as JobRecord, "/repo");
    expect(snap.review).toBeUndefined();
  });

  it("carries the prompt so the board can show what was asked", () => {
    const snap = toSnapshot({ ...job, prd: "Fix the highlighting." }, "/repo");
    expect(snap.prd).toBe("Fix the highlighting.");
  });

  it("clips a huge PRD so the hub poll does not keep the whole brief in RAM", () => {
    const prd = "x".repeat(3_000);
    const snap = toSnapshot({ ...job, prd }, "/repo");
    expect(snap.prd?.length).toBeLessThanOrEqual(2_000);
    expect(snap.prd?.endsWith("…")).toBe(true);
  });

  it("changes key when a review lands so the board re-renders", () => {
    const { review: _drop, ...bare } = job;
    const before = snapshotKey(toSnapshot(bare as JobRecord, "/repo"));
    const after = snapshotKey(toSnapshot(job, "/repo"));
    expect(before).not.toBe(after);
  });
});
