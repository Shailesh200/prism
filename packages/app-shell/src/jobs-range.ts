import type { DateRangePreset, DateRangeWindow } from "@repo-prism/ui";
import type { JobSummary } from "./jobs-types.js";

export const JOB_RANGE_MS = {
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  all: Number.MAX_SAFE_INTEGER,
} as const;

export type JobRange = keyof typeof JOB_RANGE_MS;

export const JOB_RANGES: readonly JobRange[] = [
  "30m",
  "1h",
  "6h",
  "12h",
  "24h",
  "7d",
  "all",
];

/** Archive default — same window Jobs already showed (everything). */
export const DEFAULT_JOB_RANGE: JobRange = "all";

export const JOB_RANGE_PRESETS: readonly DateRangePreset[] = [
  { id: "30m", label: "Last 30 minutes", shortLabel: "30m" },
  { id: "1h", label: "Last 1 hour", shortLabel: "1h" },
  { id: "6h", label: "Last 6 hours", shortLabel: "6h" },
  { id: "12h", label: "Last 12 hours", shortLabel: "12h" },
  { id: "24h", label: "Last 24 hours", shortLabel: "24h" },
  { id: "7d", label: "Last 7 days", shortLabel: "7d" },
  { id: "all", label: "All time", shortLabel: "All" },
];

export function jobRangeWindow(id: string, nowMs: number): DateRangeWindow {
  if (id === "all" || !(id in JOB_RANGE_MS)) {
    return { startMs: Number.NEGATIVE_INFINITY, endMs: nowMs };
  }
  return {
    startMs: nowMs - JOB_RANGE_MS[id as Exclude<JobRange, "all">],
    endMs: nowMs,
  };
}

export function jobStampMs(job: JobSummary): number | undefined {
  const raw = job.finishedAt ?? job.createdAt;
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

export function jobInRange(
  job: JobSummary,
  startMs: number,
  endMs: number,
): boolean {
  const at = jobStampMs(job);
  if (at === undefined) return true;
  return at >= startMs && at <= endMs;
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\/+$/, "");
}

/** Top-bar repo picker: `all` is every workspace; otherwise exact path. */
export function jobMatchesRepo(
  job: Pick<JobSummary, "workspacePath">,
  repoFilter: string | undefined,
): boolean {
  if (!repoFilter || repoFilter === "all") return true;
  const got = job.workspacePath ? normalizeRepoPath(job.workspacePath) : "";
  return got === normalizeRepoPath(repoFilter);
}
