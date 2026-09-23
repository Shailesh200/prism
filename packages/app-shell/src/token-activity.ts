import type { Candle, TokenCostChartProps } from "@repo-prism/ui";
import type { JobSummary, JobTokenUsage } from "./jobs-types.js";

function localDayKey(iso: string): string {
  return localDayKeyFromMs(Date.parse(iso));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localDayKeyFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function jobBilledTokens(usage: JobTokenUsage | undefined): number {
  if (!usage) return 0;
  return (
    usage.inputTokens +
    usage.outputTokens +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWriteTokens ?? 0)
  );
}

function jobTotalTokens(job: JobSummary): number {
  return jobBilledTokens(job.tokenUsage);
}

function dayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function jobStamp(job: JobSummary): number | undefined {
  const raw = job.finishedAt ?? job.createdAt;
  if (!raw) return undefined;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? at : undefined;
}

function finiteStartMs(
  startMs: number,
  endMs: number,
  jobs: readonly JobSummary[],
): number {
  if (Number.isFinite(startMs) && startMs > -1e15) return startMs;
  let earliest = endMs;
  for (const job of jobs) {
    const at = jobStamp(job);
    if (at !== undefined && at < earliest) earliest = at;
  }
  return earliest;
}

type DayAcc = {
  tokens: number;
  count: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  context: number;
  window: number;
  ticks: number[];
};

function emptyDay(): DayAcc {
  return {
    tokens: 0,
    count: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    context: 0,
    window: 0,
    ticks: [],
  };
}

export type TokenDayAnalysis = {
  readonly dayKey: string;
  readonly totalTokens: number;
  readonly jobCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly contextTokens: number;
  readonly contextWindow: number;
  readonly candle: Candle;
};

export type TokenAnalysis = TokenCostChartProps & {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly contextTokens: number;
  readonly contextWindow: number;
  readonly daysAnalyzed: readonly TokenDayAnalysis[];
};

function candleForDay(acc: DayAcc, prevClose: number): Candle {
  const close = acc.tokens;
  const open = prevClose;
  let running = open;
  let high = Math.max(open, close);
  let low = Math.min(open, close);
  for (const tick of acc.ticks) {
    running += tick;
    if (running > high) high = running;
    if (running < low) low = running;
  }
  return { open, high, low, close };
}

function finishAnalysis(
  keys: readonly string[],
  buckets: ReadonlyMap<string, DayAcc>,
  peak?: TokenCostChartProps["peak"],
  low?: TokenCostChartProps["low"],
): TokenAnalysis {
  const daysAnalyzed: TokenDayAnalysis[] = [];
  let prevClose = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let contextTokens = 0;
  let contextWindow = 0;
  for (const dayKey of keys) {
    const acc = buckets.get(dayKey) ?? emptyDay();
    const candle = candleForDay(acc, prevClose);
    prevClose = candle.close;
    inputTokens += acc.input;
    outputTokens += acc.output;
    cacheReadTokens += acc.cacheRead;
    cacheWriteTokens += acc.cacheWrite;
    if (acc.context > contextTokens) contextTokens = acc.context;
    if (acc.window > contextWindow) contextWindow = acc.window;
    daysAnalyzed.push({
      dayKey,
      totalTokens: acc.tokens,
      jobCount: acc.count,
      inputTokens: acc.input,
      outputTokens: acc.output,
      cacheReadTokens: acc.cacheRead,
      cacheWriteTokens: acc.cacheWrite,
      contextTokens: acc.context,
      contextWindow: acc.window,
      candle,
    });
  }
  const series = daysAnalyzed.map((row) => ({
    dayKey: row.dayKey,
    totalTokens: row.totalTokens,
    jobCount: row.jobCount,
  }));
  return {
    buckets: series,
    days: series.length,
    total: series.reduce((sum, b) => sum + b.totalTokens, 0),
    jobCount: series.reduce((sum, b) => sum + b.jobCount, 0),
    ...(peak ? { peak } : {}),
    ...(low ? { low } : {}),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    contextTokens,
    contextWindow,
    daysAnalyzed,
  };
}

/** Daily token spark for Overview / Trends using the same From–To window. */
export function tokenUsageInRange(
  jobs: readonly JobSummary[],
  startMs: number,
  endMs: number,
): TokenCostChartProps {
  const analysis = tokenAnalysisInRange(jobs, startMs, endMs);
  return {
    buckets: analysis.buckets,
    days: analysis.days,
    total: analysis.total,
    jobCount: analysis.jobCount,
    ...(analysis.peak ? { peak: analysis.peak } : {}),
    ...(analysis.low ? { low: analysis.low } : {}),
  };
}

/**
 * Same window as {@link tokenUsageInRange}, plus billed split, context
 * occupancy, and OHLC candles (open = previous close, close = day's billed).
 */
export function tokenAnalysisInRange(
  jobs: readonly JobSummary[],
  startMs: number,
  endMs: number,
): TokenAnalysis {
  const from = dayMs(finiteStartMs(startMs, endMs, jobs));
  const to = dayMs(endMs);
  const filterEnd = to + 86_400_000 - 1;
  const span = Math.max(1, Math.round((to - from) / 86_400_000) + 1);
  const buckets = new Map<string, DayAcc>();
  const keys: string[] = [];
  for (let i = 0; i < span; i += 1) {
    const key = localDayKeyFromMs(from + i * 86_400_000);
    keys.push(key);
    buckets.set(key, emptyDay());
  }
  let peak: { dayKey: string; title: string; tokens: number } | undefined;
  let quiet: { dayKey: string; title: string; tokens: number } | undefined;
  for (const job of jobs) {
    const at = job.finishedAt ?? job.createdAt;
    if (!at) continue;
    const atMs = Date.parse(at);
    if (Number.isNaN(atMs) || atMs < startMs || atMs > filterEnd) continue;
    const key = localDayKey(at);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const usage = job.tokenUsage;
    const tokens = jobTotalTokens(job);
    bucket.tokens += tokens;
    bucket.count += 1;
    if (usage) {
      bucket.input += usage.inputTokens;
      bucket.output += usage.outputTokens;
      bucket.cacheRead += usage.cacheReadTokens ?? 0;
      bucket.cacheWrite += usage.cacheWriteTokens ?? 0;
      bucket.context = Math.max(bucket.context, usage.contextTokens ?? 0);
      bucket.window = Math.max(bucket.window, usage.contextWindow ?? 0);
    }
    if (tokens > 0) bucket.ticks.push(tokens);
    if (tokens <= 0) continue;
    if (!peak || tokens > peak.tokens) {
      peak = { dayKey: key, title: job.title, tokens };
    }
    if (!quiet || tokens < quiet.tokens) {
      quiet = { dayKey: key, title: job.title, tokens };
    }
  }
  if (
    peak &&
    quiet &&
    peak.title === quiet.title &&
    peak.tokens === quiet.tokens
  ) {
    quiet = undefined;
  }
  return finishAnalysis(keys, buckets, peak, quiet);
}

/** Degenerate analysis when the host only has Pulse daily totals. */
export function tokenAnalysisFromChart(
  chart: TokenCostChartProps,
): TokenAnalysis {
  const buckets = new Map<string, DayAcc>();
  const keys = chart.buckets.map((row) => row.dayKey);
  for (const row of chart.buckets) {
    const acc = emptyDay();
    acc.tokens = row.totalTokens;
    acc.count = row.jobCount;
    if (row.totalTokens > 0) acc.ticks.push(row.totalTokens);
    buckets.set(row.dayKey, acc);
  }
  const analysis = finishAnalysis(keys, buckets, chart.peak, chart.low);
  return {
    ...analysis,
    ...(chart.rangeNote ? { rangeNote: chart.rangeNote } : {}),
  };
}
