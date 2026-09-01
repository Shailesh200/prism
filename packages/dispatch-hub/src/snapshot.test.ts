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
    const snap = toSnapshot(job, "/repo", Date.parse(job.updatedAt));
    expect(snap.review?.files).toHaveLength(2);
    expect(snap.review?.totalAdded).toBe(15);
    expect(snap.review?.branch).toBe("dispatch/rms-pagination");
    expect(snap.nextStep).toBe("review the changes");
  });

  it("never leaks the worktree path (ADR-0039)", () => {
    const snap = toSnapshot(job, "/repo");
    expect(JSON.stringify(snap)).not.toContain("/tmp/tree");
  });

  it("omits review for a job that has none", () => {
    const { review: _drop, ...bare } = job;
    const snap = toSnapshot(bare as JobRecord, "/repo");
    expect(snap.review).toBeUndefined();
  });

  it("changes key when a review lands so the board re-renders", () => {
    const { review: _drop, ...bare } = job;
    const before = snapshotKey(toSnapshot(bare as JobRecord, "/repo"));
    const after = snapshotKey(toSnapshot(job, "/repo"));
    expect(before).not.toBe(after);
  });
});
