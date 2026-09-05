import { describe, expect, it } from "vitest";
import type { JobSummary } from "@repo-prism/app-shell";
import {
  DEFAULT_FLEET_RANGE,
  attentionJobs,
  clusterBarLabel,
  clusterGanttBars,
  ganttBarsForRepo,
  groupRepos,
  jobsChronological,
  matchesFilter,
  parseFleetView,
  reposWithJobsInRange,
  sparklineValues,
  timelineBarLabel,
  hydrateJobs,
  verifyTag,
} from "./fleet.js";

const job = (
  patch: Partial<JobSummary> & Pick<JobSummary, "id" | "status">,
): JobSummary => ({
  title: patch.title ?? patch.id,
  branch: "",
  workspacePath: patch.workspacePath ?? "/prism",
  workspaceLabel: patch.workspaceLabel ?? "prism",
  createdAt: "2026-09-04T10:00:00.000Z",
  updatedAt: "2026-09-04T10:10:00.000Z",
  ...patch,
});

describe("parseFleetView", () => {
  it("defaults to timeline", () => {
    expect(parseFleetView(null)).toBe("timeline");
    expect(parseFleetView("nope")).toBe("timeline");
  });
});

describe("DEFAULT_FLEET_RANGE", () => {
  it("starts the canvas on 1h", () => {
    expect(DEFAULT_FLEET_RANGE).toBe("1h");
  });
});

describe("attentionJobs", () => {
  it("keeps only blocking statuses", () => {
    const rows = attentionJobs([
      job({ id: "a", status: "needs_confirm" }),
      job({ id: "b", status: "waiting_on_you" }),
      job({ id: "c", status: "needs_review" }),
      job({ id: "d", status: "running" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("groupRepos", () => {
  it("keeps registered repos even with no jobs", () => {
    const groups = groupRepos([], [{ path: "/prism", label: "prism" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.live).toBe(0);
  });
});

describe("reposWithJobsInRange", () => {
  it("hides repos that have no bars in the range", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const groups = groupRepos(
      [
        job({
          id: "a",
          status: "done",
          queuedAt: "2026-09-04T11:00:00.000Z",
          startedAt: "2026-09-04T11:10:00.000Z",
          finishedAt: "2026-09-04T11:40:00.000Z",
        }),
      ],
      [
        { path: "/prism", label: "prism" },
        { path: "/fixture", label: "m012-features" },
      ],
    );
    expect(
      reposWithJobsInRange(groups, "6h", now).map((row) => row.path),
    ).toEqual(["/prism"]);
  });
});

describe("clusterGanttBars", () => {
  it("keeps far-apart jobs on their own lines", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const bars = ganttBarsForRepo(
      [
        job({
          id: "a",
          status: "done",
          queuedAt: "2026-09-04T06:00:00.000Z",
          startedAt: "2026-09-04T06:10:00.000Z",
          finishedAt: "2026-09-04T06:40:00.000Z",
        }),
        job({
          id: "b",
          status: "done",
          queuedAt: "2026-09-04T11:00:00.000Z",
          startedAt: "2026-09-04T11:10:00.000Z",
          finishedAt: "2026-09-04T11:40:00.000Z",
        }),
      ],
      "24h",
      now,
    );
    expect(clusterGanttBars(bars)).toHaveLength(2);
  });

  it("merges jobs that start at nearly the same place on the track", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const bars = ganttBarsForRepo(
      [
        job({
          id: "a",
          status: "done",
          queuedAt: "2026-09-04T11:00:00.000Z",
          startedAt: "2026-09-04T11:02:00.000Z",
          finishedAt: "2026-09-04T11:10:00.000Z",
        }),
        job({
          id: "b",
          status: "done",
          queuedAt: "2026-09-04T11:01:00.000Z",
          startedAt: "2026-09-04T11:03:00.000Z",
          finishedAt: "2026-09-04T11:12:00.000Z",
        }),
      ],
      "24h",
      now,
    );
    const clustered = clusterGanttBars(bars);
    expect(clustered).toHaveLength(1);
    expect(clustered[0]?.jobs).toHaveLength(2);
  });

  it("labels a cluster as +N instead of a truncated count", () => {
    expect(clusterBarLabel(1)).toBe("");
    expect(clusterBarLabel(2)).toBe("+2");
    expect(clusterBarLabel(3)).toBe("+3");
  });
});

describe("hydrateJobs", () => {
  it("replaces a snapshot row with the live status", () => {
    const frozen = job({ id: "a", status: "needs_review" });
    const live = job({ id: "a", status: "done" });
    expect(hydrateJobs([frozen], [live])[0]?.status).toBe("done");
  });

  it("drops a row the live feed no longer has", () => {
    expect(
      hydrateJobs([job({ id: "gone", status: "done" })], []),
    ).toEqual([]);
  });
});

describe("timelineBarLabel", () => {
  it("labels a live job Running", () => {
    expect(
      timelineBarLabel([job({ id: "live", status: "running" })]),
    ).toBe("Running");
    expect(timelineBarLabel([job({ id: "done", status: "done" })])).toBe("");
  });
});

describe("jobsChronological", () => {
  it("orders newest created first", () => {
    const rows = jobsChronological([
      job({
        id: "old",
        status: "done",
        createdAt: "2026-09-04T10:00:00.000Z",
      }),
      job({
        id: "new",
        status: "done",
        createdAt: "2026-09-04T11:00:00.000Z",
      }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
  });
});

describe("verifyTag", () => {
  it("maps passed/failed/missing onto Success/Failure/NA", () => {
    expect(verifyTag("passed")).toEqual({ label: "Success", tone: "emerald" });
    expect(verifyTag("failed")).toEqual({ label: "Failure", tone: "rose" });
    expect(verifyTag(undefined)).toEqual({ label: "NA", tone: "neutral" });
  });
});

describe("ganttBarsForRepo", () => {
  it("emits a bar that overlaps the range", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const bars = ganttBarsForRepo(
      [
        job({
          id: "a",
          status: "done",
          queuedAt: "2026-09-04T11:00:00.000Z",
          startedAt: "2026-09-04T11:10:00.000Z",
          finishedAt: "2026-09-04T11:40:00.000Z",
        }),
      ],
      "6h",
      now,
    );
    expect(bars).toHaveLength(1);
    expect(bars[0]?.waited).toBeDefined();
    expect(bars[0]?.worked).toBeDefined();
  });
});

describe("sparklineValues", () => {
  it("counts jobs into buckets", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const values = sparklineValues(
      [job({ id: "a", status: "done", createdAt: "2026-09-04T11:00:00.000Z" })],
      "24h",
      now,
      24,
    );
    expect(values.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("matchesFilter", () => {
  it("matches title or repo", () => {
    const row = job({ id: "ship-gate", status: "done", title: "Ship gate" });
    expect(matchesFilter(row, "ship")).toBe(true);
    expect(matchesFilter(row, "website")).toBe(false);
  });
});
