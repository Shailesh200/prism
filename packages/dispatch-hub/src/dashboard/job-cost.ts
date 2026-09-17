/**
 * Job cost aggregation (M-074 K1/K2): tokenUsage already rides on every
 * JobSummary the hub snapshot sends (packages/dispatch-hub/src/snapshot.ts)
 * — this is a pure client-side rollup of data already delivered, the same
 * shape as `pulseSections`/`groupJobsByRepo` in fleet.ts. No new snapshot
 * field needed: the raw per-job usage was the only missing piece, and it
 * was never missing.
 */

import type { JobSummary } from "@repo-prism/app-shell";

export type DayTokenBucket = {
  readonly dayKey: string;
  readonly totalTokens: number;
  readonly jobCount: number;
};

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function jobTotalTokens(job: JobSummary): number {
  const u = job.tokenUsage;
  if (!u) return 0;
  return (
    u.inputTokens +
    u.outputTokens +
    (u.cacheReadTokens ?? 0) +
    (u.cacheWriteTokens ?? 0)
  );
}

/**
 * Ascending, zero-filled buckets for the trailing `days` days ending today
 * (by `nowMs`). A job with no `tokenUsage` (still running, or predates
 * M-065) contributes 0, never `undefined` — a hole would read as "no chart
 * data" rather than "no usage yet".
 */
export function aggregateTokensByDay(
  jobs: readonly JobSummary[],
  days: number,
  nowMs: number,
): readonly DayTokenBucket[] {
  const buckets = new Map<string, { tokens: number; count: number }>();
  const dayMs = 86_400_000;
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = localDayKey(new Date(nowMs - i * dayMs).toISOString());
    keys.push(key);
    buckets.set(key, { tokens: 0, count: 0 });
  }
  const earliest = nowMs - days * dayMs;
  for (const job of jobs) {
    const at = job.finishedAt ?? job.createdAt;
    if (!at) continue;
    const atMs = Date.parse(at);
    if (Number.isNaN(atMs) || atMs < earliest) continue;
    const key = localDayKey(at);
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside the window after all (DST edge, etc.)
    bucket.tokens += jobTotalTokens(job);
    bucket.count += 1;
  }
  return keys.map((key) => ({
    dayKey: key,
    totalTokens: buckets.get(key)!.tokens,
    jobCount: buckets.get(key)!.count,
  }));
}

export type ExtremeJob = {
  readonly job: JobSummary;
  readonly tokens: number;
  readonly dayKey: string;
};

/**
 * The single job that burned the most, and the least, tokens in the trailing
 * `days` window — day *totals* can hide this (a quiet day can still hold the
 * one runaway job). Jobs with no usage are excluded from both ends; `least`
 * is omitted rather than pointing at the same job as `most`.
 */
export function extremeJobsByTokens(
  jobs: readonly JobSummary[],
  days: number,
  nowMs: number,
): { readonly most?: ExtremeJob; readonly least?: ExtremeJob } {
  const dayMs = 86_400_000;
  const earliest = nowMs - days * dayMs;
  let most: ExtremeJob | undefined;
  let least: ExtremeJob | undefined;
  for (const job of jobs) {
    const at = job.finishedAt ?? job.createdAt;
    if (!at) continue;
    const atMs = Date.parse(at);
    if (Number.isNaN(atMs) || atMs < earliest || atMs > nowMs) continue;
    const tokens = jobTotalTokens(job);
    if (tokens <= 0) continue;
    const dayKey = localDayKey(at);
    if (!most || tokens > most.tokens) most = { job, tokens, dayKey };
    if (!least || tokens < least.tokens) least = { job, tokens, dayKey };
  }
  if (most && least && most.job === least.job) return { most };
  return { most, least };
}

/** `1234` -> "1.2k", `950` -> "950". Never more than 3 significant digits. */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** `{"claude-sonnet-4-5": {inputPer1M, outputPer1M}}` — user-provided, local only. */
export type ModelPriceTable = Record<
  string,
  { readonly inputPer1M: number; readonly outputPer1M: number }
>;

/**
 * `null` when there is no price for this model — the caller must fall back
 * to showing tokens, never a fabricated `$0.00` (M-074 K2).
 */
export function estimateJobCost(
  job: JobSummary,
  prices: ModelPriceTable,
): number | null {
  const usage = job.tokenUsage;
  const model = job.workerModel;
  if (!usage || !model) return null;
  const rate = prices[model];
  if (!rate) return null;
  return (
    (usage.inputTokens / 1_000_000) * rate.inputPer1M +
    (usage.outputTokens / 1_000_000) * rate.outputPer1M
  );
}

/** Sum of `estimateJobCost` across jobs, or `null` if none had a price. */
export function estimateTotalCost(
  jobs: readonly JobSummary[],
  prices: ModelPriceTable,
): number | null {
  let total = 0;
  let priced = 0;
  for (const job of jobs) {
    const cost = estimateJobCost(job, prices);
    if (cost === null) continue;
    total += cost;
    priced += 1;
  }
  return priced > 0 ? total : null;
}
