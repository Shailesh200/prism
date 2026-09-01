import { describe, expect, it } from "vitest";
import { formatJobFinishedNotice } from "./notice.js";
import { TERMINAL_STATUSES } from "./types.js";
import type { JobSnapshot } from "./types.js";

const base: JobSnapshot = {
  id: "rms-pagination",
  title: "RMS pagination 100k+ cap",
  status: "done",
  workspacePath: "/repo",
  workspaceLabel: "repo",
  branch: "dispatch/rms-pagination",
  lastActivity: "Done",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:10:00.000Z",
  elapsedMs: 600_000,
};

describe("finish notices", () => {
  it("treats needs_review as a finish so the user is told at all", () => {
    // It was missing from this list, so the one state that needs a human
    // decision never raised a notification.
    expect(TERMINAL_STATUSES).toContain("needs_review");
  });

  it("says what changed and that nothing landed", () => {
    const copy = formatJobFinishedNotice({
      ...base,
      status: "needs_review",
      review: {
        files: [
          { path: "src/a.ts", added: 10, removed: 2, change: "modified" },
          { path: "src/b.ts", added: 5, removed: 0, change: "added" },
        ],
        totalAdded: 15,
        totalRemoved: 2,
        truncated: false,
        branch: "dispatch/rms-pagination",
        baseRef: "main",
        committed: true,
        merged: false,
      },
    });
    expect(copy.title).toMatch(/ready for your review/i);
    expect(copy.body).toContain("2 files changed");
    expect(copy.body).toContain("+15 -2");
    expect(copy.body).toMatch(/nothing merged for you/i);
  });

  it("still reports a failed check on a review", () => {
    const copy = formatJobFinishedNotice({
      ...base,
      status: "needs_review",
      verification: "failed",
      verificationDetail: "typecheck failed",
      review: {
        files: [{ path: "src/a.ts", added: 1, removed: 0, change: "modified" }],
        totalAdded: 1,
        totalRemoved: 0,
        truncated: false,
        branch: "b",
        baseRef: "main",
        committed: true,
        merged: false,
      },
    });
    expect(copy.body).toContain("typecheck failed");
  });

  it("never leaks a worktree path or hex job id", () => {
    const copy = formatJobFinishedNotice({ ...base, status: "error" });
    expect(copy.title).not.toMatch(/job-[0-9a-f]{6}/);
    expect(`${copy.title} ${copy.body}`).not.toContain("/tmp/");
  });
});
