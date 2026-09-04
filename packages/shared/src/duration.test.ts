import { describe, expect, it } from "vitest";
import {
  durationMs,
  formatDuration,
  formatDurationOr,
  formatJobDuration,
  jobDurations,
  primaryDurationMs,
} from "./duration.js";

const T0 = "2026-09-02T10:00:00.000Z";
const at = (seconds: number): string =>
  new Date(Date.parse(T0) + seconds * 1000).toISOString();

describe("durationMs", () => {
  it("measures between two timestamps", () => {
    expect(durationMs(T0, at(90))).toBe(90_000);
  });

  it("accepts a numeric end so callers can pass Date.now()", () => {
    expect(durationMs(T0, Date.parse(at(5)))).toBe(5_000);
  });

  it("returns undefined rather than zero for an unparseable start", () => {
    expect(durationMs("not-a-date", at(5))).toBeUndefined();
  });

  it("returns undefined for a missing start", () => {
    expect(durationMs(undefined, at(5))).toBeUndefined();
  });

  it("returns undefined for a missing end", () => {
    expect(durationMs(T0, undefined)).toBeUndefined();
  });

  it("never goes negative when clocks disagree", () => {
    expect(durationMs(at(10), T0)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("shows seconds under a minute", () => {
    expect(formatDuration(4_000)).toBe("4s");
    expect(formatDuration(0)).toBe("0s");
  });

  it("keeps seconds visible above a minute, which the statusline used to drop", () => {
    expect(formatDuration(90_000)).toBe("1m 30s");
  });

  it("omits a zero seconds remainder", () => {
    expect(formatDuration(120_000)).toBe("2m");
  });

  it("switches to hours and minutes past an hour", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(3_840_000)).toBe("1h 4m");
  });

  it("returns undefined for unknown input instead of a confident zero", () => {
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration(Number.NaN)).toBeUndefined();
    expect(formatDuration(-1)).toBeUndefined();
  });
});

describe("formatDurationOr", () => {
  it("falls back to a placeholder for unknown", () => {
    expect(formatDurationOr(undefined)).toBe("—");
    expect(formatDurationOr(undefined, "unknown")).toBe("unknown");
  });
});

describe("jobDurations", () => {
  it("splits queued from working once a job has started", () => {
    const d = jobDurations(
      { createdAt: T0, queuedAt: T0, startedAt: at(30), finishedAt: at(90) },
      Date.parse(at(500)),
    );
    expect(d.queued).toBe(30_000);
    expect(d.working).toBe(60_000);
    expect(d.total).toBe(90_000);
    expect(d.live).toBe(false);
  });

  it("freezes a finished job so later renders cannot grow its time", () => {
    const job = {
      createdAt: T0,
      queuedAt: T0,
      startedAt: at(10),
      finishedAt: at(70),
    };
    const early = jobDurations(job, Date.parse(at(80)));
    const late = jobDurations(job, Date.parse(at(9_000)));
    expect(late.total).toBe(early.total);
    expect(late.working).toBe(early.working);
  });

  it("reports a still-waiting job as queued with no working time", () => {
    const d = jobDurations({ createdAt: T0, queuedAt: T0 }, Date.parse(at(45)));
    expect(d.queued).toBe(45_000);
    expect(d.working).toBeUndefined();
    expect(d.live).toBe(true);
  });

  it("keeps ticking for a running job", () => {
    const job = { createdAt: T0, queuedAt: T0, startedAt: at(10) };
    expect(jobDurations(job, Date.parse(at(20))).working).toBe(10_000);
    expect(jobDurations(job, Date.parse(at(40))).working).toBe(30_000);
  });

  it("falls back to createdAt when queuedAt is absent on a legacy record", () => {
    const d = jobDurations({ createdAt: T0 }, Date.parse(at(15)));
    expect(d.queued).toBe(15_000);
  });

  // A record written before P-S1 ends in a terminal status with no
  // `finishedAt`. Treating it as live is what rendered a job that ended
  // yesterday as "17h 30m" on the Console board.
  it("stops the clock on a pre-P-S1 finished job using updatedAt", () => {
    const job = {
      createdAt: T0,
      startedAt: at(10),
      status: "done",
      updatedAt: at(70),
    };
    const soon = jobDurations(job, Date.parse(at(80)));
    const muchLater = jobDurations(job, Date.parse(at(90_000)));
    expect(soon.working).toBe(60_000);
    expect(muchLater.working).toBe(60_000);
    expect(muchLater.live).toBe(false);
  });

  // The other direction of the same defect. `updatedAt` is the last write to
  // the record, not the last sign of life: a supervisor that stamped the job
  // once and never again leaves it milliseconds after creation, and the board
  // then reports "0s" for a job whose worker was still writing eight minutes
  // later. Found on a real record during the M-067 ship gate.
  it("prefers the heartbeat when the record froze but the worker kept writing", () => {
    const job = {
      createdAt: T0,
      status: "done",
      updatedAt: at(0.2),
      lastHeartbeat: at(496),
    };
    expect(jobDurations(job, Date.parse(at(90_000))).total).toBe(496_000);
  });

  it("still uses updatedAt when it is the later of the two", () => {
    const job = {
      createdAt: T0,
      status: "done",
      updatedAt: at(60),
      lastHeartbeat: at(20),
    };
    expect(jobDurations(job, Date.parse(at(90_000))).total).toBe(60_000);
  });

  it("reports unknown when a finished record carries no evidence at all", () => {
    const job = { createdAt: T0, status: "done" };
    expect(jobDurations(job, Date.parse(at(90_000))).total).toBeUndefined();
  });

  it("stops the clock for every terminal status, not just done", () => {
    for (const status of [
      "cancelled",
      "error",
      "failed",
      "needs_review",
      "paused",
    ]) {
      const d = jobDurations(
        { createdAt: T0, startedAt: at(10), status, updatedAt: at(70) },
        Date.parse(at(50_000)),
      );
      expect(d.working, status).toBe(60_000);
      expect(d.live, status).toBe(false);
    }
  });

  it("keeps counting for a live status even without finishedAt", () => {
    const job = {
      createdAt: T0,
      startedAt: at(10),
      status: "running",
      updatedAt: at(20),
    };
    expect(jobDurations(job, Date.parse(at(40))).working).toBe(30_000);
    expect(jobDurations(job, Date.parse(at(40))).live).toBe(true);
  });

  // Unknown must stay unknown: inventing a duration is the failure mode this
  // module exists to prevent.
  it("reports unknown when a finished job has neither finishedAt nor updatedAt", () => {
    const d = jobDurations(
      { createdAt: T0, startedAt: at(10), status: "done" },
      Date.parse(at(9_000)),
    );
    expect(d.working).toBeUndefined();
    expect(d.total).toBeUndefined();
  });

  it("prefers finishedAt over updatedAt when both are present", () => {
    const d = jobDurations(
      {
        createdAt: T0,
        startedAt: at(10),
        finishedAt: at(70),
        status: "done",
        updatedAt: at(600),
      },
      Date.parse(at(9_000)),
    );
    expect(d.working).toBe(60_000);
  });
});

describe("primaryDurationMs", () => {
  it("reports the wait while a job is queued", () => {
    expect(
      primaryDurationMs({ createdAt: T0, queuedAt: T0 }, Date.parse(at(12))),
    ).toBe(12_000);
  });

  it("switches to working time once the worker starts", () => {
    expect(
      primaryDurationMs(
        { createdAt: T0, queuedAt: T0, startedAt: at(10) },
        Date.parse(at(25)),
      ),
    ).toBe(15_000);
  });
});

describe("formatJobDuration", () => {
  it("shows the split so a slow pipeline is distinguishable from a slow agent", () => {
    const label = formatJobDuration(
      { createdAt: T0, queuedAt: T0, startedAt: at(540), finishedAt: at(720) },
      Date.parse(at(1_000)),
    );
    expect(label).toBe("12m (waited 9m, worked 3m)");
  });

  it("collapses to the total when the wait was negligible", () => {
    const label = formatJobDuration({
      createdAt: T0,
      queuedAt: T0,
      startedAt: T0,
      finishedAt: at(180),
    });
    expect(label).toBe("3m");
  });

  it("returns undefined when there is nothing defensible to show", () => {
    expect(formatJobDuration({ createdAt: "nonsense" })).toBeUndefined();
  });
});
