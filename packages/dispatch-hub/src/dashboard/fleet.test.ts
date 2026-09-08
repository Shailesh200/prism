import { describe, expect, it } from "vitest";
import type { JobSummary } from "@repo-prism/app-shell";
import {
  DEFAULT_FLEET_RANGE,
  attentionJobs,
  clusterGanttBars,
  FAILURES_VISIBLE,
  ganttBarsForRepo,
  contentTimeWindow,
  groupRepos,
  isWorkingJob,
  nowPlayheadPercent,
  groupJobsByRepo,
  jobTreeLabel,
  trackGridPercents,
  jobsChronological,
  jobsInRange,
  matchesFilter,
  overflowMoreLabel,
  packTimelineLanes,
  barTitleInset,
  barTitleSlot,
  overflowChipRange,
  jobChecksRunning,
  laneTag,
  fleetAxisWindow,
  hoverTimeMs,
  jobWindow,
  pointerPercent,
  axisTickMarks,
  axisLabelStyle,
  timelineLanesForRepo,
  visibleTimelineLanes,
  parseFleetView,
  pulseBucket,
  pulseIdleRepos,
  pulseSections,
  waitWorkMeter,
  canInstructJob,
  canStartFromJob,
  reposWithJobsInRange,
  sparklineValues,
  stackVisible,
  timelineBarLabel,
  timelineBarShowsTitle,
  timelineBarTip,
  timelineRepoStatus,
  hydrateJobs,
  repoStatusTag,
  verifyTag,
  visibleFleetRepos,
  PLAYBOOKS,
  playbookHint,
  compactJobPrd,
  composeQueuedPrd,
  reviewTargetOf,
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
  it("defaults to timeline (Pulse)", () => {
    expect(parseFleetView(null)).toBe("timeline");
    expect(parseFleetView("nope")).toBe("timeline");
    expect(parseFleetView("pulse")).toBe("timeline");
    expect(parseFleetView("timeline")).toBe("timeline");
  });
});

describe("DEFAULT_FLEET_RANGE", () => {
  it("starts the canvas on 1h", () => {
    expect(DEFAULT_FLEET_RANGE).toBe("1h");
  });
});

describe("attentionJobs", () => {
  it("keeps blocking statuses including stuck and review", () => {
    const rows = attentionJobs([
      job({ id: "a", status: "needs_confirm" }),
      job({ id: "b", status: "waiting_on_you" }),
      job({ id: "c", status: "paused" }),
      job({ id: "d", status: "needs_review" }),
      job({ id: "stuck", status: "blocked" }),
      job({ id: "e", status: "running" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d", "stuck"]);
  });
});

describe("canStartFromJob / canInstructJob", () => {
  it("starts a sibling from every status except a live run", () => {
    expect(canStartFromJob("done")).toBe(true);
    expect(canStartFromJob("paused")).toBe(true);
    expect(canStartFromJob("queued")).toBe(true);
    expect(canStartFromJob("running")).toBe(false);
  });

  it("adds a follow-up only while the teammate is running", () => {
    expect(canInstructJob("running")).toBe(true);
    expect(canInstructJob("booting")).toBe(false);
    expect(canInstructJob("paused")).toBe(false);
    expect(canInstructJob("done")).toBe(false);
  });
});

describe("pulseBucket", () => {
  it("splits gates out of live", () => {
    expect(pulseBucket(job({ id: "a", status: "running" }))).toBe("live");
    expect(pulseBucket(job({ id: "b", status: "queued" }))).toBe("live");
    expect(pulseBucket(job({ id: "c", status: "needs_confirm" }))).toBe(
      "needsYou",
    );
    expect(pulseBucket(job({ id: "blocked", status: "blocked" }))).toBe(
      "needsYou",
    );
    expect(pulseBucket(job({ id: "d", status: "waiting_on_you" }))).toBe(
      "needsYou",
    );
    expect(pulseBucket(job({ id: "e", status: "paused" }))).toBe("needsYou");
    expect(pulseBucket(job({ id: "review", status: "needs_review" }))).toBe(
      "needsYou",
    );
    expect(pulseBucket(job({ id: "g", status: "done" }))).toBe("settled");
    expect(pulseBucket(job({ id: "h", status: "error" }))).toBe("settled");
    expect(pulseBucket(job({ id: "i", status: "cancelled" }))).toBe("settled");
  });
});

describe("pulseSections", () => {
  it("groups jobs in range into Live / Needs you / Settled", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const sections = pulseSections(
      [
        job({
          id: "live",
          status: "running",
          queuedAt: "2026-09-04T11:40:00.000Z",
          startedAt: "2026-09-04T11:50:00.000Z",
          updatedAt: "2026-09-04T11:55:00.000Z",
        }),
        job({
          id: "gate",
          status: "needs_confirm",
          queuedAt: "2026-09-04T11:30:00.000Z",
          updatedAt: "2026-09-04T11:31:00.000Z",
        }),
        job({
          id: "done",
          status: "done",
          queuedAt: "2026-09-04T11:00:00.000Z",
          startedAt: "2026-09-04T11:05:00.000Z",
          finishedAt: "2026-09-04T11:20:00.000Z",
          updatedAt: "2026-09-04T11:20:00.000Z",
        }),
      ],
      "1h",
      now,
    );
    expect(sections.live.map((row) => row.id)).toEqual(["live"]);
    expect(sections.needsYou.map((row) => row.id)).toEqual(["gate"]);
    expect(sections.settled.map((row) => row.id)).toEqual(["done"]);
  });

  it("filters by an absolute window the same way List and Board do", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const rows = [
      job({
        id: "old",
        status: "done",
        createdAt: "2026-09-04T08:00:00.000Z",
        finishedAt: "2026-09-04T08:10:00.000Z",
        updatedAt: "2026-09-04T08:10:00.000Z",
      }),
      job({
        id: "recent",
        status: "done",
        createdAt: "2026-09-04T11:30:00.000Z",
        finishedAt: "2026-09-04T11:40:00.000Z",
        updatedAt: "2026-09-04T11:40:00.000Z",
      }),
    ];
    expect(jobsInRange(rows, "1h", now).map((row) => row.id)).toEqual([
      "recent",
    ]);
    expect(
      jobsInRange(
        rows,
        { startMs: Date.parse("2026-09-04T07:00:00.000Z"), endMs: now },
        now,
      ).map((row) => row.id),
    ).toEqual(["old", "recent"]);
  });
});

describe("pulseIdleRepos", () => {
  it("names registered repos with nothing in range", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const idle = pulseIdleRepos(
      groupRepos(
        [
          job({
            id: "a",
            status: "done",
            queuedAt: "2026-09-04T11:00:00.000Z",
            startedAt: "2026-09-04T11:01:00.000Z",
            finishedAt: "2026-09-04T11:02:00.000Z",
            workspacePath: "/prism",
            workspaceLabel: "prism",
          }),
        ],
        [
          { path: "/prism", label: "prism" },
          { path: "/website", label: "website" },
        ],
      ),
      "1h",
      now,
    );
    expect(idle.map((row) => row.label)).toEqual(["website"]);
  });
});

describe("waitWorkMeter", () => {
  it("splits waited and worked into complementary percents", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const meter = waitWorkMeter(
      job({
        id: "split",
        status: "done",
        queuedAt: "2026-09-04T11:00:00.000Z",
        startedAt: "2026-09-04T11:30:00.000Z",
        finishedAt: "2026-09-04T12:00:00.000Z",
      }),
      now,
    );
    expect(meter.waited).toBe("30m");
    expect(meter.worked).toBe("30m");
    expect(meter.waitPct).toBe(50);
    expect(meter.workPct).toBe(50);
    expect(meter.outcomePct).toBe(0);
    expect(meter.outcome).toBeUndefined();
  });

  it("keeps wait and work colours and adds a failed cap", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const meter = waitWorkMeter(
      job({
        id: "failed",
        status: "error",
        queuedAt: "2026-09-04T11:00:00.000Z",
        startedAt: "2026-09-04T11:30:00.000Z",
        finishedAt: "2026-09-04T12:00:00.000Z",
      }),
      now,
    );
    expect(meter.waitPct).toBe(45);
    expect(meter.workPct).toBe(45);
    expect(meter.outcomePct).toBe(10);
    expect(meter.outcome).toBe("error");
  });

  it("caps a cancelled job without recolouring wait or work", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const meter = waitWorkMeter(
      job({
        id: "cancelled",
        status: "cancelled",
        queuedAt: "2026-09-04T11:00:00.000Z",
        startedAt: "2026-09-04T11:30:00.000Z",
        finishedAt: "2026-09-04T12:00:00.000Z",
      }),
      now,
    );
    expect(meter.waitPct).toBe(45);
    expect(meter.workPct).toBe(45);
    expect(meter.outcomePct).toBe(10);
    expect(meter.outcome).toBe("cancelled");
  });

  it("fills the bar with the outcome when wait and work are both zero", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const meter = waitWorkMeter(
      job({
        id: "instant",
        status: "error",
        createdAt: "2026-09-04T12:00:00.000Z",
        updatedAt: "2026-09-04T12:00:00.000Z",
        queuedAt: "2026-09-04T12:00:00.000Z",
        startedAt: "2026-09-04T12:00:00.000Z",
        finishedAt: "2026-09-04T12:00:00.000Z",
      }),
      now,
    );
    expect(meter.waitPct).toBe(0);
    expect(meter.workPct).toBe(0);
    expect(meter.outcomePct).toBe(100);
    expect(meter.outcome).toBe("error");
  });
});

describe("groupRepos", () => {
  it("keeps registered repos even with no jobs", () => {
    const groups = groupRepos([], [{ path: "/prism", label: "prism" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.live).toBe(0);
  });

  it("does not invent a repo from an unregistered job path", () => {
    const groups = groupRepos(
      [
        job({
          id: "a",
          status: "done",
          workspacePath: "/fixture",
          workspaceLabel: "m012-features",
        }),
      ],
      [{ path: "/prism", label: "prism" }],
    );
    expect(groups.map((row) => row.path)).toEqual(["/prism"]);
  });
});

describe("reposWithJobsInRange", () => {
  it("names which repos have bars in the range", () => {
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

describe("visibleFleetRepos", () => {
  it("keeps registered repos when the range has no jobs", () => {
    const rows = visibleFleetRepos(
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
      "",
      "all",
    );
    expect(rows.map((row) => row.path).sort()).toEqual(["/fixture", "/prism"]);
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
    expect(clusterGanttBars(bars, now)).toHaveLength(2);
  });

  it("merges jobs that overlap in time into one +N bar", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const bars = ganttBarsForRepo(
      [
        job({
          id: "a",
          status: "done",
          queuedAt: "2026-09-04T11:00:00.000Z",
          startedAt: "2026-09-04T11:00:00.000Z",
          finishedAt: "2026-09-04T11:20:00.000Z",
        }),
        job({
          id: "b",
          status: "done",
          queuedAt: "2026-09-04T11:10:00.000Z",
          startedAt: "2026-09-04T11:10:00.000Z",
          finishedAt: "2026-09-04T11:25:00.000Z",
        }),
      ],
      "24h",
      now,
    );
    const clustered = clusterGanttBars(bars, now);
    expect(clustered).toHaveLength(1);
    expect(clustered[0]?.jobs).toHaveLength(2);
  });

  it("keeps sequential jobs on their own bars even when starts look close", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const bars = ganttBarsForRepo(
      [
        job({
          id: "a",
          status: "done",
          queuedAt: "2026-09-04T11:00:00.000Z",
          startedAt: "2026-09-04T11:00:00.000Z",
          finishedAt: "2026-09-04T11:08:00.000Z",
        }),
        job({
          id: "b",
          status: "done",
          queuedAt: "2026-09-04T11:20:00.000Z",
          startedAt: "2026-09-04T11:20:00.000Z",
          finishedAt: "2026-09-04T11:28:00.000Z",
        }),
      ],
      "24h",
      now,
    );
    expect(clusterGanttBars(bars, now)).toHaveLength(2);
  });

  it("clusters overlapping jobs even when statuses differ", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const bars = ganttBarsForRepo(
      [
        job({
          id: "ok",
          status: "done",
          queuedAt: "2026-09-04T11:00:00.000Z",
          startedAt: "2026-09-04T11:00:00.000Z",
          finishedAt: "2026-09-04T11:20:00.000Z",
        }),
        job({
          id: "bad",
          status: "error",
          queuedAt: "2026-09-04T11:05:00.000Z",
          startedAt: "2026-09-04T11:05:00.000Z",
          finishedAt: "2026-09-04T11:18:00.000Z",
        }),
      ],
      "24h",
      now,
    );
    const clustered = clusterGanttBars(bars, now);
    expect(clustered).toHaveLength(1);
    expect(clustered[0]?.jobs.map((row) => row.id).sort()).toEqual([
      "bad",
      "ok",
    ]);
  });

  it("does not cluster sequential jobs on All just because ticks share pixels", () => {
    const now = Date.parse("2026-09-05T18:00:00.000Z");
    const bars = ganttBarsForRepo(
      [
        job({
          id: "a",
          status: "done",
          queuedAt: "2026-09-05T16:00:00.000Z",
          startedAt: "2026-09-05T16:00:00.000Z",
          finishedAt: "2026-09-05T16:05:00.000Z",
        }),
        job({
          id: "b",
          status: "done",
          queuedAt: "2026-09-05T17:00:00.000Z",
          startedAt: "2026-09-05T17:00:00.000Z",
          finishedAt: "2026-09-05T17:05:00.000Z",
        }),
      ],
      "all",
      now,
    );
    expect(clusterGanttBars(bars, now)).toHaveLength(2);
  });
});

describe("packTimelineLanes", () => {
  it("keeps sequential jobs on one lane", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const packed = packTimelineLanes(
      ganttBarsForRepo(
        [
          job({
            id: "a",
            status: "done",
            queuedAt: "2026-09-04T11:00:00.000Z",
            startedAt: "2026-09-04T11:00:00.000Z",
            finishedAt: "2026-09-04T11:08:00.000Z",
          }),
          job({
            id: "b",
            status: "error",
            queuedAt: "2026-09-04T11:20:00.000Z",
            startedAt: "2026-09-04T11:20:00.000Z",
            finishedAt: "2026-09-04T11:28:00.000Z",
          }),
        ],
        "24h",
        now,
      ),
      now,
    );
    expect(packed.laneCount).toBe(1);
    expect(packed.overflows).toHaveLength(0);
    expect(packed.bars.map((row) => [row.job.id, row.lane])).toEqual([
      ["a", 0],
      ["b", 0],
    ]);
  });

  it("overlays overlapping jobs on one row with their own colours", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const packed = packTimelineLanes(
      ganttBarsForRepo(
        [
          job({
            id: "ok",
            status: "done",
            queuedAt: "2026-09-04T11:00:00.000Z",
            startedAt: "2026-09-04T11:00:00.000Z",
            finishedAt: "2026-09-04T11:20:00.000Z",
          }),
          job({
            id: "bad",
            status: "error",
            queuedAt: "2026-09-04T11:05:00.000Z",
            startedAt: "2026-09-04T11:05:00.000Z",
            finishedAt: "2026-09-04T11:18:00.000Z",
          }),
        ],
        "24h",
        now,
      ),
      now,
    );
    expect(packed.laneCount).toBe(1);
    expect(packed.overflows).toHaveLength(0);
    expect(packed.bars.map((row) => [row.job.id, row.lane])).toEqual([
      ["ok", 0],
      ["bad", 1],
    ]);
  });

  it("hides extra concurrent jobs behind +N more", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const packed = packTimelineLanes(
      ganttBarsForRepo(
        [
          job({
            id: "a",
            status: "done",
            queuedAt: "2026-09-04T11:00:00.000Z",
            startedAt: "2026-09-04T11:00:00.000Z",
            finishedAt: "2026-09-04T11:30:00.000Z",
          }),
          job({
            id: "b",
            status: "error",
            queuedAt: "2026-09-04T11:00:00.000Z",
            startedAt: "2026-09-04T11:00:00.000Z",
            finishedAt: "2026-09-04T11:30:00.000Z",
          }),
          job({
            id: "c",
            status: "cancelled",
            queuedAt: "2026-09-04T11:00:00.000Z",
            startedAt: "2026-09-04T11:00:00.000Z",
            finishedAt: "2026-09-04T11:30:00.000Z",
          }),
        ],
        "24h",
        now,
      ),
      now,
    );
    expect(packed.bars).toHaveLength(2);
    expect(packed.overflows).toHaveLength(1);
    expect(packed.overflows[0]?.jobs.map((row) => row.id)).toEqual(["c"]);
    expect(packed.laneCount).toBe(1);
    const clusterEnd = Math.max(
      ...packed.bars.map((bar) =>
        bar.worked
          ? bar.worked.left + bar.worked.width
          : (bar.waited?.left ?? 0) + (bar.waited?.width ?? 0),
      ),
    );
    expect(packed.overflows[0]?.left).toBeCloseTo(clusterEnd, 5);
    expect(overflowMoreLabel(packed.overflows[0]?.jobs.length ?? 0)).toBe(
      "+1 more",
    );
  });
});

describe("barTitleInset", () => {
  it("shifts a covered title past the overlay so it starts at the first letter", () => {
    const long = {
      job: job({ id: "long", status: "done" as const }),
      worked: { left: 0, width: 100 },
      lane: 0,
    };
    const overlay = {
      job: job({ id: "over", status: "done" as const }),
      worked: { left: 0, width: 25 },
      lane: 1,
    };
    expect(barTitleInset(long, [long, overlay])).toBe(25);
    expect(barTitleInset(overlay, [long, overlay])).toBe(0);
  });

  it("leaves the title at the start when the overlay is not on the left edge", () => {
    const long = {
      job: job({ id: "long", status: "done" as const }),
      worked: { left: 0, width: 100 },
      lane: 0,
    };
    const overlay = {
      job: job({ id: "over", status: "done" as const }),
      worked: { left: 40, width: 20 },
      lane: 1,
    };
    expect(barTitleInset(long, [long, overlay])).toBe(0);
  });
});

describe("overflowChipRange", () => {
  it("clamps a chip that would hang off the left of the track", () => {
    expect(overflowChipRange({ left: 2 }, 10)).toEqual({ left: 0, right: 10 });
  });

  it("keeps a chip anchored to the cluster when there is room", () => {
    expect(overflowChipRange({ left: 40 }, 10)).toEqual({
      left: 30,
      right: 40,
    });
  });
});

describe("barTitleSlot", () => {
  const long = {
    job: job({ id: "long", status: "done" as const }),
    worked: { left: 0, width: 100 },
    lane: 0,
  };

  it("shortens the title before a +N more chip instead of painting under it", () => {
    const slot = barTitleSlot(
      long,
      [long],
      [{ left: 40, width: 0, atMs: 0, jobs: [] }],
      10,
    );
    expect(slot?.left).toBe(0);
    expect(slot?.width).toBe(30);
    expect(slot?.trackWidth).toBe(30);
  });

  it("starts the title after a chip that covers the left edge", () => {
    const slot = barTitleSlot(
      long,
      [long],
      [{ left: 15, width: 0, atMs: 0, jobs: [] }],
      10,
    );
    expect(slot?.left).toBe(15);
    expect(slot?.width).toBe(85);
  });

  it("hides the title when overlays leave no 12% gap", () => {
    const overlay = {
      job: job({ id: "over", status: "done" as const }),
      worked: { left: 0, width: 95 },
      lane: 1,
    };
    expect(barTitleSlot(long, [long, overlay])).toBeUndefined();
  });
});

describe("jobChecksRunning", () => {
  it("treats lastActivity as the live Checking signal", () => {
    expect(jobChecksRunning({ lastActivity: "Running checks…" })).toBe(true);
    expect(jobChecksRunning({ lastActivity: "Checks failed" })).toBe(false);
  });
});

describe("overflowMoreLabel", () => {
  it("names leftover items the way Calendar does", () => {
    expect(overflowMoreLabel(0)).toBe("");
    expect(overflowMoreLabel(1)).toBe("+1 more");
    expect(overflowMoreLabel(2)).toBe("+2 more");
  });
});

describe("stackVisible", () => {
  it("keeps a short list intact", () => {
    expect(stackVisible(["a", "b"], FAILURES_VISIBLE)).toEqual({
      visible: ["a", "b"],
      hidden: 0,
    });
  });

  it("clips Recent failures to three chips plus a hidden count", () => {
    const stacked = stackVisible(["a", "b", "c", "d", "e"], FAILURES_VISIBLE);
    expect(stacked.visible).toEqual(["a", "b", "c"]);
    expect(stacked.hidden).toBe(2);
    expect(overflowMoreLabel(stacked.hidden)).toBe("+2 more");
  });
});

describe("hydrateJobs", () => {
  it("replaces a snapshot row with the live status", () => {
    const frozen = job({ id: "a", status: "needs_review" });
    const live = job({ id: "a", status: "done" });
    expect(hydrateJobs([frozen], [live])[0]?.status).toBe("done");
  });

  it("drops a row the live feed no longer has", () => {
    expect(hydrateJobs([job({ id: "gone", status: "done" })], [])).toEqual([]);
  });
});

describe("timelineBarLabel", () => {
  it("puts the job title on the bar", () => {
    expect(
      timelineBarLabel(
        job({ id: "live", status: "running", title: "Ship gate" }),
      ),
    ).toBe("Ship gate");
    expect(
      timelineBarLabel(job({ id: "done", status: "done", title: "Audit" })),
    ).toBe("Audit");
  });
});

describe("timelineBarShowsTitle", () => {
  it("hides copy on tight ticks and keeps it on a wide bar", () => {
    expect(timelineBarShowsTitle(1)).toBe(false);
    expect(timelineBarShowsTitle(12)).toBe(true);
    expect(timelineBarShowsTitle(40, 80)).toBe(false);
    expect(timelineBarShowsTitle(40, 0)).toBe(true);
  });
});

describe("timelineBarTip", () => {
  it("pairs the job title with start time, waited and worked", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const tip = timelineBarTip(
      {
        title: "Attention cards",
        verification: "failed",
        queuedAt: "2026-09-04T11:10:00.000Z",
      },
      { waited: "0s", worked: "23m" },
      now,
    );
    expect(tip.label).toBe("Attention cards");
    expect(tip.detail).toMatch(/^Started /);
    expect(tip.detail).toMatch(/Waited 0s/);
    expect(tip.detail).toMatch(/worked 23m/);
    expect(tip.detail).toMatch(/verify failed/);
  });

  it("uses a date when the job started on another day", () => {
    const tip = timelineBarTip(
      {
        title: "Audit",
        queuedAt: "2026-09-01T12:00:00.000Z",
      },
      { waited: "0s", worked: "1h" },
      Date.parse("2026-09-04T12:00:00.000Z"),
    );
    expect(tip.detail).toMatch(/^Started /);
    expect(tip.detail).toMatch(/2026/);
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

describe("timelineRepoStatus", () => {
  it("shows the latest job status, not verify", () => {
    const last = job({
      id: "z",
      status: "done",
      verification: "failed",
    });
    expect(
      timelineRepoStatus({
        live: 0,
        last,
        jobs: [last],
      }),
    ).toEqual({ label: "Done", tone: "emerald" });
  });

  it("prefers a live job over a settled last", () => {
    const last = job({ id: "old", status: "done" });
    const live = job({ id: "now", status: "running" });
    expect(
      timelineRepoStatus({
        live: 1,
        last,
        jobs: [last, live],
      }),
    ).toEqual({ label: "Running", tone: "accent" });
  });

  it("maps a failed last job to Failed", () => {
    const last = job({ id: "z", status: "error" });
    expect(
      timelineRepoStatus({
        live: 0,
        last,
        jobs: [last],
      }),
    ).toEqual({ label: "Failed", tone: "rose" });
  });
});

describe("repoStatusTag", () => {
  it("shows job status, not last verify", () => {
    const done = job({ id: "ok", status: "done", verification: "failed" });
    expect(
      repoStatusTag({
        live: 0,
        last: done,
        jobs: [done],
      }),
    ).toEqual({ label: "Done", tone: "emerald" });
    expect(
      repoStatusTag({
        live: 1,
        last: done,
        jobs: [job({ id: "live", status: "running" }), done],
      }).label,
    ).toBe("Running");
    expect(repoStatusTag({ live: 0, error: "missing", jobs: [] })).toEqual({
      label: "Error",
      tone: "rose",
    });
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
    const span = (bars[0]?.waited?.width ?? 0) + (bars[0]?.worked?.width ?? 0);
    expect(span).toBeGreaterThan(80);
  });

  it("fills a repo's own track, not a sibling repo's older span", () => {
    const now = Date.parse("2026-09-05T18:00:00.000Z");
    const recent = ganttBarsForRepo(
      [
        job({
          id: "pilot",
          status: "done",
          queuedAt: "2026-09-05T17:00:00.000Z",
          startedAt: "2026-09-05T17:00:00.000Z",
          finishedAt: "2026-09-05T17:06:00.000Z",
        }),
      ],
      "all",
      now,
    );
    const span =
      (recent[0]?.waited?.width ?? 0) + (recent[0]?.worked?.width ?? 0);
    expect(span).toBeGreaterThan(80);
  });
});

describe("contentTimeWindow", () => {
  it("crops a 7d filter to the 3d of jobs that exist", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const window = contentTimeWindow(
      [
        job({
          id: "old",
          status: "done",
          queuedAt: "2026-09-01T12:00:00.000Z",
          startedAt: "2026-09-01T12:00:00.000Z",
          finishedAt: "2026-09-01T13:00:00.000Z",
        }),
        job({
          id: "new",
          status: "done",
          queuedAt: "2026-09-04T10:00:00.000Z",
          startedAt: "2026-09-04T10:00:00.000Z",
          finishedAt: "2026-09-04T11:00:00.000Z",
        }),
      ],
      "7d",
      now,
    );
    const span = window.endMs - window.startMs;
    expect(span).toBeLessThan(4 * 24 * 60 * 60 * 1000);
    expect(span).toBeGreaterThan(2 * 24 * 60 * 60 * 1000);
  });

  it("crops All to first → last job instead of padding out to now", () => {
    const now = Date.parse("2026-09-05T18:00:00.000Z");
    const window = contentTimeWindow(
      [
        job({
          id: "a",
          status: "done",
          queuedAt: "2026-09-04T10:00:00.000Z",
          startedAt: "2026-09-04T10:00:00.000Z",
          finishedAt: "2026-09-04T12:00:00.000Z",
        }),
        job({
          id: "b",
          status: "done",
          queuedAt: "2026-09-05T10:00:00.000Z",
          startedAt: "2026-09-05T10:00:00.000Z",
          finishedAt: "2026-09-05T11:00:00.000Z",
        }),
      ],
      "all",
      now,
    );
    expect(window.endMs).toBeLessThan(now - 6 * 60 * 60 * 1000);
    expect(window.startMs).toBeGreaterThan(
      Date.parse("2026-09-04T09:00:00.000Z"),
    );
  });
});

describe("nowPlayheadPercent", () => {
  it("places now on the cropped axis", () => {
    expect(nowPlayheadPercent({ startMs: 0, endMs: 100 }, 88)).toBe(88);
  });

  it("hides the playhead when now is off the crop", () => {
    expect(nowPlayheadPercent({ startMs: 0, endMs: 100 }, 150)).toBeUndefined();
  });

  it("keeps the hairline inside the track at the right edge", () => {
    expect(nowPlayheadPercent({ startMs: 0, endMs: 100 }, 100)).toBe(99.5);
  });
});

describe("jobWindow", () => {
  it("uses lastHeartbeat when finishedAt froze at the start of a 3-minute error", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const win = jobWindow(
      job({
        id: "err",
        status: "error",
        queuedAt: "2026-09-04T11:00:00.000Z",
        startedAt: "2026-09-04T11:00:00.000Z",
        finishedAt: "2026-09-04T11:00:01.000Z",
        lastHeartbeat: "2026-09-04T11:03:00.000Z",
      }),
      now,
    );
    expect(win.endMs - win.startMs).toBe(3 * 60 * 1000);
  });
});

describe("hoverTimeMs", () => {
  it("maps a pointer percent onto the axis clock", () => {
    expect(hoverTimeMs({ startMs: 0, endMs: 100 }, 50)).toBe(50);
    expect(pointerPercent(25, { left: 0, width: 100 })).toBe(25);
  });
});

describe("trackGridPercents", () => {
  it("keeps quarter marks", () => {
    expect(trackGridPercents()).toEqual([0, 25, 50, 75]);
  });

  it("drops a mark that sits on the playhead", () => {
    expect(trackGridPercents(25)).toEqual([0, 50, 75]);
  });
});

describe("isWorkingJob", () => {
  it("pulses executing jobs, not gated ones", () => {
    expect(isWorkingJob("running")).toBe(true);
    expect(isWorkingJob("queued")).toBe(false);
    expect(isWorkingJob("waiting_on_you")).toBe(false);
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

describe("laneTag", () => {
  it("labels lanes A–Z then wraps", () => {
    expect(laneTag(0)).toBe("A");
    expect(laneTag(25)).toBe("Z");
    expect(laneTag(26)).toBe("A");
  });
});

describe("visibleTimelineLanes", () => {
  it("keeps three lanes collapsed and reveals the rest when expanded", () => {
    const lanes = [0, 1, 2, 3, 4];
    expect(visibleTimelineLanes(lanes, false)).toEqual([0, 1, 2]);
    expect(visibleTimelineLanes(lanes, true)).toEqual(lanes);
    expect(visibleTimelineLanes([0, 1], false)).toEqual([0, 1]);
  });
});

describe("fleetAxisWindow", () => {
  it("crops a finite range when the work is a small slice of the filter", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const jobs = [
      job({
        id: "short",
        status: "error",
        queuedAt: "2026-09-04T11:50:00.000Z",
        startedAt: "2026-09-04T11:51:00.000Z",
        finishedAt: "2026-09-04T11:55:00.000Z",
      }),
    ];
    const window = fleetAxisWindow(jobs, "1h", now);
    const content = contentTimeWindow(jobs, "1h", now);
    expect(window).toEqual(content);
    expect(window.endMs - window.startMs).toBeLessThan(20 * 60 * 1000);
  });

  it("keeps a finite range when jobs already fill the clock", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const window = fleetAxisWindow(
      [
        job({
          id: "early",
          status: "done",
          queuedAt: "2026-09-04T11:05:00.000Z",
          startedAt: "2026-09-04T11:05:00.000Z",
          finishedAt: "2026-09-04T11:20:00.000Z",
        }),
        job({
          id: "late",
          status: "done",
          queuedAt: "2026-09-04T11:40:00.000Z",
          startedAt: "2026-09-04T11:40:00.000Z",
          finishedAt: "2026-09-04T11:58:00.000Z",
        }),
      ],
      "1h",
      now,
    );
    expect(window.startMs).toBe(now - 60 * 60 * 1000);
    expect(window.endMs).toBeGreaterThan(now);
  });

  it("crops All to first → last job across the fleet", () => {
    const now = Date.parse("2026-09-05T18:00:00.000Z");
    const jobs = [
      job({
        id: "old",
        status: "done",
        queuedAt: "2026-09-01T12:00:00.000Z",
        startedAt: "2026-09-01T12:00:00.000Z",
        finishedAt: "2026-09-01T13:00:00.000Z",
      }),
      job({
        id: "new",
        status: "done",
        queuedAt: "2026-09-04T10:00:00.000Z",
        startedAt: "2026-09-04T10:00:00.000Z",
        finishedAt: "2026-09-04T11:00:00.000Z",
      }),
    ];
    const window = fleetAxisWindow(jobs, "all", now);
    const crop = contentTimeWindow(jobs, "all", now);
    expect(window).toEqual(crop);
    expect(window.endMs).toBeLessThan(now);
  });
});

describe("axisTickMarks", () => {
  it("places four quarter-marks on the shared axis", () => {
    const window = { startMs: 0, endMs: 400 };
    expect(axisTickMarks(window)).toEqual([
      { left: 0, atMs: 0 },
      { left: 25, atMs: 100 },
      { left: 50, atMs: 200 },
      { left: 75, atMs: 300 },
    ]);
  });

  it("uses times on a 6h span and dates on 7d", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    expect(axisLabelStyle(fleetAxisWindow([], "6h", now))).toBe("time");
    expect(axisLabelStyle(fleetAxisWindow([], "7d", now))).toBe("date");
  });
});

describe("timelineLanesForRepo", () => {
  it("sorts one lane per job latest-first", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const axis = fleetAxisWindow([], "6h", now);
    const lanes = timelineLanesForRepo(
      [
        job({
          id: "later",
          status: "done",
          queuedAt: "2026-09-04T10:00:00.000Z",
          startedAt: "2026-09-04T10:00:00.000Z",
          finishedAt: "2026-09-04T10:20:00.000Z",
        }),
        job({
          id: "earlier",
          status: "done",
          queuedAt: "2026-09-04T08:00:00.000Z",
          startedAt: "2026-09-04T08:00:00.000Z",
          finishedAt: "2026-09-04T08:10:00.000Z",
        }),
      ],
      "6h",
      now,
      axis,
    );
    expect(lanes.map((lane) => lane.job.id)).toEqual(["later", "earlier"]);
  });
});

describe("PLAYBOOKS", () => {
  it("offers Review, Audit, Test, and a finding attach path", () => {
    const labels = PLAYBOOKS.map((row) => row.label);
    expect(labels[0]).toBe("Blank brief");
    expect(labels).not.toContain("None");
    expect(labels).toContain("Review");
    expect(labels).not.toContain("Review a PR");
    expect(labels).toContain("From a finding");
    expect(labels).toContain("Audit");
    expect(labels).toContain("Test");
    expect(labels).toContain("Investigate");
    expect(playbookHint("finding")).toMatch(/write-up/i);
    expect(reviewTargetOf("uncommitted")?.label).toBe("Uncommitted changes");
  });

  it("attaches review and finding context above the user prompt", () => {
    expect(
      composeQueuedPrd({
        prd: "Fix the flaky test.",
        reviewSeed: reviewTargetOf("pr")?.seed,
        finding: { title: "Audit tests", text: "The suite is flaky." },
      }),
    ).toBe(
      [
        "Review the open pull request. Audit the diff, tests, and risk before anything lands.",
        "Context from finding: Audit tests\n\nThe suite is flaky.",
        "Fix the flaky test.",
      ].join("\n\n"),
    );
    expect(compactJobPrd("Short.")).toBe("Short.");
    expect(compactJobPrd("word ".repeat(80)).endsWith("…")).toBe(true);
    expect(compactJobPrd("word ".repeat(80)).length).toBeLessThanOrEqual(160);
  });
});

describe("groupJobsByRepo", () => {
  it("keeps first-seen repo order and nests jobs", () => {
    const groups = groupJobsByRepo([
      job({
        id: "a",
        status: "running",
        workspacePath: "/a",
        workspaceLabel: "alpha",
      }),
      job({
        id: "b",
        status: "done",
        workspacePath: "/b",
        workspaceLabel: "beta",
      }),
      job({
        id: "c",
        status: "queued",
        workspacePath: "/a",
        workspaceLabel: "alpha",
      }),
    ]);
    expect(groups.map((row) => row.label)).toEqual(["alpha", "beta"]);
    expect(groups[0]?.jobs.map((row) => row.id)).toEqual(["a", "c"]);
  });
});

describe("jobTreeLabel", () => {
  it("names the user's checkout versus a worktree branch", () => {
    expect(jobTreeLabel(job({ id: "a", status: "running" }))).toEqual({
      label: "This checkout",
      you: true,
      worktree: false,
    });
    expect(
      jobTreeLabel(
        job({
          id: "b",
          status: "running",
          placement: "worktree",
          branch: "prism/fix-news",
        }),
      ),
    ).toEqual({
      label: "prism/fix-news",
      you: false,
      worktree: true,
    });
  });
});
