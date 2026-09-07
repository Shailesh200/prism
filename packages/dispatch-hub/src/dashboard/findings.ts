import {
  jobNotePaths,
  orderJobsForBoard,
  type JobSummary,
} from "@repo-prism/app-shell";
import { resolveRangeWindow, type FleetTimeRange } from "./fleet.js";

/**
 * Jobs that left a write-up, in the same order as the Jobs board: live work
 * first, then history, newest trigger time first.
 */
export function findingsIndex(
  jobs: readonly JobSummary[],
): readonly JobSummary[] {
  return orderJobsForBoard(jobs.filter((job) => jobNotePaths(job).length > 0));
}

/** Same clock the job card uses: finished, else started, else accepted. */
export function findingWhenIso(
  job: Pick<JobSummary, "finishedAt" | "startedAt" | "createdAt" | "updatedAt">,
): string | undefined {
  return job.finishedAt ?? job.startedAt ?? job.createdAt ?? job.updatedAt;
}

export function findingsInView(
  jobs: readonly JobSummary[],
  options: {
    readonly filter?: string;
    readonly repo?: string;
    readonly range?: FleetTimeRange;
    readonly nowMs?: number;
  } = {},
): readonly JobSummary[] {
  const nowMs = options.nowMs ?? Date.now();
  const selected = resolveRangeWindow(options.range ?? "all", nowMs);
  const needle = (options.filter ?? "").trim().toLowerCase();
  const repo =
    options.repo && options.repo !== "all" ? options.repo : undefined;
  return findingsIndex(jobs).filter((job) => {
    if (repo && job.workspacePath !== repo) return false;
    const when = Date.parse(findingWhenIso(job) ?? "");
    if (
      Number.isFinite(when) &&
      (when < selected.startMs || when > selected.endMs)
    ) {
      return false;
    }
    if (!needle) return true;
    const hay = [
      job.title,
      job.workspaceLabel,
      job.workspacePath,
      ...(job.notes ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  });
}

/** Keep a seeded job in the picker even when it left no write-up. */
export function withSeedFinding(
  listed: readonly JobSummary[],
  seed: JobSummary | undefined,
): readonly JobSummary[] {
  if (!seed) return listed;
  if (
    listed.some(
      (job) => job.id === seed.id && job.workspacePath === seed.workspacePath,
    )
  ) {
    return listed;
  }
  return [seed, ...listed];
}

/** Write-ups that belong to one registered checkout. */
export function findingsForRepo(
  jobs: readonly JobSummary[],
  workspace: string,
  options: {
    readonly range?: FleetTimeRange;
    readonly filter?: string;
    readonly nowMs?: number;
  } = {},
): readonly JobSummary[] {
  if (!workspace.trim()) return [];
  return findingsInView(jobs, {
    repo: workspace,
    range: options.range ?? "all",
    ...(options.filter ? { filter: options.filter } : {}),
    ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
  });
}
