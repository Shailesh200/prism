import type { JobSummary } from "@repo-prism/app-shell";

/**
 * Jobs that belong on the Attention inbox: gates, stalled work, and pauses.
 * Live running jobs stay on Jobs / Focus — they are not waiting on you.
 */
export function attentionJobs(
  jobs: readonly JobSummary[],
): readonly JobSummary[] {
  return jobs.filter(
    (job) =>
      job.status === "needs_confirm" ||
      job.status === "waiting_on_you" ||
      job.status === "paused",
  );
}
