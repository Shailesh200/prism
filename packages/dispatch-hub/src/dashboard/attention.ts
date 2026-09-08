import type { JobSummary } from "@repo-prism/app-shell";

/**
 * Jobs that belong on Pulse Needs you / Board waiting: gates, stuck work, reviews, and pauses.
 * Live running jobs stay on Live / Focus — they are not waiting on you.
 */
export function attentionJobs(
  jobs: readonly JobSummary[],
): readonly JobSummary[] {
  return jobs.filter(
    (job) =>
      job.status === "needs_confirm" ||
      job.status === "waiting_on_you" ||
      job.status === "paused" ||
      job.status === "blocked" ||
      job.status === "needs_review",
  );
}
