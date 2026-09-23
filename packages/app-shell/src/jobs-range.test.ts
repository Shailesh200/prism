import { describe, expect, it } from "vitest";
import type { JobSummary } from "./jobs-types.js";
import {
  DEFAULT_JOB_RANGE,
  jobInRange,
  jobMatchesRepo,
  jobRangeWindow,
} from "./jobs-range.js";

function job(partial: Partial<JobSummary> & { id: string }): JobSummary {
  return {
    title: partial.title ?? partial.id,
    status: "done",
    branch: "main",
    ...partial,
  } as JobSummary;
}

describe("jobRangeWindow", () => {
  it("defaults the archive to all time", () => {
    expect(DEFAULT_JOB_RANGE).toBe("all");
    const window = jobRangeWindow(DEFAULT_JOB_RANGE, 1_000);
    expect(window.startMs).toBe(Number.NEGATIVE_INFINITY);
    expect(window.endMs).toBe(1_000);
  });
});

describe("jobInRange", () => {
  it("keeps undated jobs visible", () => {
    expect(jobInRange(job({ id: "x" }), 10, 20)).toBe(true);
  });

  it("includes a job whose stamp sits inside the window", () => {
    expect(
      jobInRange(
        job({ id: "in", finishedAt: "2026-09-21T00:00:00.000Z" }),
        Date.parse("2026-09-20T00:00:00.000Z"),
        Date.parse("2026-09-22T00:00:00.000Z"),
      ),
    ).toBe(true);
  });
});

describe("jobMatchesRepo", () => {
  it("keeps every job when the picker is All", () => {
    expect(jobMatchesRepo(job({ id: "a", workspacePath: "/a" }), "all")).toBe(
      true,
    );
    expect(
      jobMatchesRepo(job({ id: "b", workspacePath: "/b" }), undefined),
    ).toBe(true);
  });

  it("drops jobs from other workspaces", () => {
    expect(jobMatchesRepo(job({ id: "a", workspacePath: "/a" }), "/a")).toBe(
      true,
    );
    expect(jobMatchesRepo(job({ id: "b", workspacePath: "/b" }), "/a")).toBe(
      false,
    );
    expect(jobMatchesRepo(job({ id: "c" }), "/a")).toBe(false);
  });
});
