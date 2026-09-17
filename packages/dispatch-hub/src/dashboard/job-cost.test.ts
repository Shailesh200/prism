import { describe, expect, it } from "vitest";
import type { JobSummary } from "@repo-prism/app-shell";
import {
  aggregateTokensByDay,
  estimateJobCost,
  estimateTotalCost,
  extremeJobsByTokens,
  formatTokenCount,
} from "./job-cost.js";

function job(patch: Partial<JobSummary> = {}): JobSummary {
  return {
    id: "j1",
    title: "Fix auth",
    status: "done",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    ...patch,
  } as JobSummary;
}

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-17T12:00:00.000Z");

describe("aggregateTokensByDay (M-074 K1)", () => {
  it("zero-fills every day in the window, even with no jobs", () => {
    const buckets = aggregateTokensByDay([], 3, NOW);
    expect(buckets).toHaveLength(3);
    expect(buckets.every((b) => b.totalTokens === 0 && b.jobCount === 0)).toBe(
      true,
    );
    expect(buckets[2]!.dayKey).toBe("2026-09-17");
  });

  it("sums input+output+cache tokens onto the job's finish day", () => {
    const jobs = [
      job({
        finishedAt: new Date(NOW).toISOString(),
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
          cacheWriteTokens: 5,
        },
      }),
    ];
    const buckets = aggregateTokensByDay(jobs, 1, NOW);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.totalTokens).toBe(165);
    expect(buckets[0]!.jobCount).toBe(1);
  });

  it("falls back to createdAt when finishedAt is absent (still-running job)", () => {
    const jobs = [
      job({
        createdAt: new Date(NOW).toISOString(),
        tokenUsage: { inputTokens: 10, outputTokens: 0 },
      }),
    ];
    const buckets = aggregateTokensByDay(jobs, 1, NOW);
    expect(buckets[0]!.totalTokens).toBe(10);
  });

  it("excludes jobs outside the window", () => {
    const jobs = [
      job({
        finishedAt: new Date(NOW - 10 * DAY).toISOString(),
        tokenUsage: { inputTokens: 999, outputTokens: 0 },
      }),
    ];
    const buckets = aggregateTokensByDay(jobs, 3, NOW);
    expect(buckets.reduce((sum, b) => sum + b.totalTokens, 0)).toBe(0);
  });

  it("counts a job with no tokenUsage as zero, not a hole", () => {
    const jobs = [job({ finishedAt: new Date(NOW).toISOString() })];
    const buckets = aggregateTokensByDay(jobs, 1, NOW);
    expect(buckets[0]!.totalTokens).toBe(0);
    expect(buckets[0]!.jobCount).toBe(1);
  });
});

describe("extremeJobsByTokens (M-074 chart UX)", () => {
  it("finds the single most- and least-expensive job, not just the loudest day", () => {
    const jobs = [
      job({
        id: "quiet-day-big-job",
        finishedAt: new Date(NOW - 5 * DAY).toISOString(),
        tokenUsage: { inputTokens: 900_000, outputTokens: 100_000 },
      }),
      job({
        id: "small-job",
        finishedAt: new Date(NOW - 2 * DAY).toISOString(),
        tokenUsage: { inputTokens: 10, outputTokens: 5 },
      }),
    ];
    const { most, least } = extremeJobsByTokens(jobs, 14, NOW);
    expect(most?.job.id).toBe("quiet-day-big-job");
    expect(least?.job.id).toBe("small-job");
  });

  it("omits jobs with no usage, and omits least when only one job has usage", () => {
    const jobs = [
      job({ id: "no-usage", finishedAt: new Date(NOW).toISOString() }),
      job({
        id: "only-priced",
        finishedAt: new Date(NOW).toISOString(),
        tokenUsage: { inputTokens: 100, outputTokens: 0 },
      }),
    ];
    const { most, least } = extremeJobsByTokens(jobs, 14, NOW);
    expect(most?.job.id).toBe("only-priced");
    expect(least).toBeUndefined();
  });

  it("excludes jobs outside the window", () => {
    const jobs = [
      job({
        finishedAt: new Date(NOW - 30 * DAY).toISOString(),
        tokenUsage: { inputTokens: 999_999, outputTokens: 0 },
      }),
    ];
    expect(extremeJobsByTokens(jobs, 14, NOW).most).toBeUndefined();
  });
});

describe("formatTokenCount", () => {
  it("leaves small counts as-is", () => {
    expect(formatTokenCount(950)).toBe("950");
  });

  it("compacts thousands and millions", () => {
    expect(formatTokenCount(12_400)).toBe("12.4k");
    expect(formatTokenCount(1_000)).toBe("1k");
    expect(formatTokenCount(2_500_000)).toBe("2.5M");
  });
});

describe("estimateJobCost / estimateTotalCost (M-074 K2)", () => {
  const prices = {
    "claude-sonnet-4-5": { inputPer1M: 3, outputPer1M: 15 },
  };

  it("estimates from the model's rate when both usage and price are known", () => {
    const j = job({
      workerModel: "claude-sonnet-4-5",
      tokenUsage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    expect(estimateJobCost(j, prices)).toBe(18);
  });

  it("returns null rather than fabricating $0 when the model has no price", () => {
    const j = job({
      workerModel: "some-unpriced-model",
      tokenUsage: { inputTokens: 1000, outputTokens: 1000 },
    });
    expect(estimateJobCost(j, prices)).toBeNull();
  });

  it("returns null when there is no tokenUsage at all", () => {
    const j = job({ workerModel: "claude-sonnet-4-5" });
    expect(estimateJobCost(j, prices)).toBeNull();
  });

  it("totals only the priced jobs, and is null when none are priced", () => {
    const priced = job({
      workerModel: "claude-sonnet-4-5",
      tokenUsage: { inputTokens: 1_000_000, outputTokens: 0 },
    });
    const unpriced = job({
      workerModel: "unknown-model",
      tokenUsage: { inputTokens: 1_000_000, outputTokens: 0 },
    });
    expect(estimateTotalCost([priced, unpriced], prices)).toBe(3);
    expect(estimateTotalCost([unpriced], prices)).toBeNull();
    expect(estimateTotalCost([unpriced], {})).toBeNull();
  });
});
