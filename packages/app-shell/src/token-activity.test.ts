import { describe, expect, it } from "vitest";
import type { JobSummary } from "./jobs-types.js";
import {
  tokenAnalysisFromChart,
  tokenAnalysisInRange,
  tokenUsageInRange,
} from "./token-activity.js";

function job(partial: Partial<JobSummary> & { id: string }): JobSummary {
  return {
    title: partial.title ?? partial.id,
    status: "done",
    branch: "main",
    ...partial,
  } as JobSummary;
}

describe("tokenUsageInRange", () => {
  it("fills daily buckets inside the window and names the peak job", () => {
    const usage = tokenUsageInRange(
      [
        job({
          id: "a",
          title: "Fix login",
          finishedAt: "2026-09-18T10:00:00.000Z",
          tokenUsage: { inputTokens: 1000, outputTokens: 200 },
        }),
        job({
          id: "b",
          title: "Quiet chore",
          finishedAt: "2026-09-19T10:00:00.000Z",
          tokenUsage: { inputTokens: 10, outputTokens: 5 },
        }),
      ],
      Date.parse("2026-09-18T00:00:00.000Z"),
      Date.parse("2026-09-19T23:59:59.000Z"),
    );
    expect(usage.jobCount).toBe(2);
    expect(usage.total).toBe(1215);
    expect(usage.peak?.title).toBe("Fix login");
    expect(usage.low?.title).toBe("Quiet chore");
  });

  it("clamps an All window to the earliest job instead of exploding the series", () => {
    const end = new Date(2026, 8, 18, 23, 59, 59).getTime();
    const usage = tokenUsageInRange(
      [
        job({
          id: "a",
          title: "Fix login",
          finishedAt: new Date(2026, 8, 18, 10, 0, 0).toISOString(),
          tokenUsage: { inputTokens: 100, outputTokens: 20 },
        }),
      ],
      Number.NEGATIVE_INFINITY,
      end,
    );
    expect(usage.days).toBe(1);
    expect(usage.total).toBe(120);
    expect(usage.jobCount).toBe(1);
    expect(usage.buckets[0]?.totalTokens).toBe(120);
  });

  it("pads All with zero days after the last job through the range end", () => {
    const usage = tokenUsageInRange(
      [
        job({
          id: "a",
          title: "Fix login",
          finishedAt: new Date(2026, 8, 18, 10, 0, 0).toISOString(),
          tokenUsage: { inputTokens: 4_200_000, outputTokens: 80_000 },
        }),
      ],
      Number.NEGATIVE_INFINITY,
      new Date(2026, 8, 21, 15, 0, 0).getTime(),
    );
    expect(usage.days).toBe(4);
    expect(usage.buckets.map((b) => b.totalTokens)).toEqual([
      4_280_000, 0, 0, 0,
    ]);
  });

  it("keeps zero days inside a finite From–To window", () => {
    const usage = tokenUsageInRange(
      [
        job({
          id: "a",
          title: "Fix login",
          finishedAt: new Date(2026, 8, 18, 10, 0, 0).toISOString(),
          tokenUsage: { inputTokens: 100, outputTokens: 20 },
        }),
      ],
      new Date(2026, 8, 18).getTime(),
      new Date(2026, 8, 21).getTime(),
    );
    expect(usage.days).toBe(4);
    expect(usage.buckets.map((b) => b.totalTokens)).toEqual([120, 0, 0, 0]);
  });

  it("rolls billed split, context, and OHLC candles for the same window", () => {
    const dayA = new Date(2026, 8, 18, 10, 0, 0).getTime();
    const dayB = new Date(2026, 8, 19, 10, 0, 0).getTime();
    const analysis = tokenAnalysisInRange(
      [
        job({
          id: "a",
          title: "Fix login",
          finishedAt: new Date(dayA).toISOString(),
          tokenUsage: {
            inputTokens: 1000,
            outputTokens: 200,
            cacheReadTokens: 50,
            contextTokens: 8_000,
            contextWindow: 200_000,
          },
        }),
        job({
          id: "b",
          title: "Quiet chore",
          finishedAt: new Date(dayB).toISOString(),
          tokenUsage: {
            inputTokens: 10,
            outputTokens: 5,
            contextTokens: 1_200,
            contextWindow: 200_000,
          },
        }),
      ],
      new Date(2026, 8, 18).getTime(),
      new Date(2026, 8, 19).getTime(),
    );
    expect(analysis.inputTokens).toBe(1010);
    expect(analysis.outputTokens).toBe(205);
    expect(analysis.cacheReadTokens).toBe(50);
    expect(analysis.contextTokens).toBe(8_000);
    expect(analysis.contextWindow).toBe(200_000);
    const billed = analysis.daysAnalyzed.filter((row) => row.totalTokens > 0);
    expect(billed).toHaveLength(2);
    expect(billed[0]!.candle.open).toBe(0);
    expect(billed[0]!.candle.close).toBe(1250);
    expect(billed[1]!.candle.open).toBe(1250);
    expect(billed[1]!.candle.close).toBe(15);
    expect(billed[1]!.candle.high).toBe(1265);
  });

  it("builds trend candles from a Pulse daily spark when jobs are absent", () => {
    const analysis = tokenAnalysisFromChart({
      buckets: [
        { dayKey: "2026-09-18", totalTokens: 100, jobCount: 1 },
        { dayKey: "2026-09-19", totalTokens: 40, jobCount: 2 },
      ],
      days: 2,
      total: 140,
      jobCount: 3,
    });
    expect(analysis.daysAnalyzed[0]?.candle.close).toBe(100);
    expect(analysis.daysAnalyzed[1]?.candle.open).toBe(100);
    expect(analysis.daysAnalyzed[1]?.candle.close).toBe(40);
  });
});
