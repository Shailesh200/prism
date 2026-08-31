import { describe, expect, it } from "vitest";
import { formatJobFinishedNotice } from "./notice.js";
import type { JobSnapshot } from "./types.js";

function job(patch: Partial<JobSnapshot>): JobSnapshot {
  return {
    id: "audit-issues",
    title: "audit-issues",
    status: "done",
    workspacePath: "/repos/prism",
    workspaceLabel: "prism",
    branch: "dispatch/audit-issues",
    lastActivity: "Done",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:01:00.000Z",
    elapsedMs: 60_000,
    ...patch,
  };
}

describe("finished-job notice copy", () => {
  it("uses the title and result, never a worktree path", () => {
    const copy = formatJobFinishedNotice(
      job({
        resultSummary: "Checks passed.",
        verification: "passed",
      }),
    );
    expect(copy.title).toBe("audit-issues finished");
    expect(copy.body).toMatch(/Checks passed/);
    expect(copy.title + copy.body).not.toMatch(/worktree|\/Users\/|job-/);
  });

  it("speaks a failure without dumping a path", () => {
    const copy = formatJobFinishedNotice(
      job({
        status: "error",
        errorMessage: "typecheck failed — Cannot find name Foo",
      }),
    );
    expect(copy.title).toBe("audit-issues failed");
    expect(copy.body).toMatch(/typecheck failed/);
  });
});
