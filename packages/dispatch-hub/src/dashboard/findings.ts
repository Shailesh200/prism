import {
  jobNotePaths,
  orderJobsForBoard,
  type JobSummary,
} from "@repo-prism/app-shell";

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
