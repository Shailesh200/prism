import { describe, expect, it } from "vitest";
import { diffJobs } from "./watch.js";
import type { JobSnapshot } from "./types.js";

function job(patch: Partial<JobSnapshot>): JobSnapshot {
  return {
    id: "news-tab",
    title: "news-tab",
    status: "running",
    workspacePath: "/repos/app",
    workspaceLabel: "app",
    branch: "dispatch/news-tab",
    lastActivity: "Editing files",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:10.000Z",
    elapsedMs: 10_000,
    ...patch,
  };
}

describe("job snapshot diff", () => {
  it("emits job.finished once when a run becomes done", () => {
    const seen = new Set<string>();
    const running = job({ status: "running" });
    const done = job({
      status: "done",
      lastActivity: "Done",
      resultSummary: "Checks passed.",
      updatedAt: "2026-08-31T00:02:00.000Z",
    });
    const first = diffJobs([running], [done], seen);
    expect(first.some((event) => event.type === "job.finished")).toBe(true);
    const second = diffJobs([done], [done], seen);
    expect(second.some((event) => event.type === "job.finished")).toBe(false);
  });

  it("does not finish jobs that were already terminal", () => {
    const seen = new Set<string>();
    const done = job({
      status: "done",
      lastActivity: "Done",
      resultSummary: "Checks passed.",
    });
    expect(
      diffJobs([done], [done], seen).some(
        (event) => event.type === "job.finished",
      ),
    ).toBe(false);
  });

  it("emits job.updated when activity changes", () => {
    const seen = new Set<string>();
    const events = diffJobs(
      [job({ lastActivity: "Thinking" })],
      [job({ lastActivity: "Editing files" })],
      seen,
    );
    expect(events.some((event) => event.type === "job.updated")).toBe(true);
  });
});
