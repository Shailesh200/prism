/**
 * The Finding Loop re-scan (M-071 L3). Never resolves a finding because the
 * job reached `done` — only because a fresh scan says the fingerprint is
 * gone. A repo whose checks are `—` (verify-plan found nothing to run) still
 * gets re-scanned once the worker stops; a `failed` verification leaves the
 * finding untouched.
 */

import { loadJobs, updateJobs } from "./jobs.js";
import { reapJobs } from "./run-state.js";
import type { JobRecord } from "./types.js";

/** `false` once the originating report no longer contains this fingerprint. */
export type FindingStillOpen = (input: {
  readonly fingerprint: string;
  readonly workspaceRoot: string;
}) => Promise<boolean>;

type PendingFindingJob = JobRecord & { readonly findingFingerprint: string };

function pendingFindingJobs(jobs: readonly JobRecord[]): PendingFindingJob[] {
  return jobs.filter(
    (job): job is PendingFindingJob =>
      Boolean(job.findingFingerprint) &&
      job.verification === "passed" &&
      !job.findingResolution,
  );
}

/**
 * Re-scans every finding job whose verification just passed and whose
 * resolution is not yet known, then persists `resolved` / `open`. Safe to
 * call repeatedly — jobs already resolved (or not yet verified) are left
 * alone.
 *
 * `stillOpen` re-indexes and re-runs a report, which can take a while on a
 * large repo. It must never run inside the `jobs.json` write lock — every
 * other write (a worker's own progress patches, another job's placement)
 * would queue up behind it for the full re-scan, and a couple of them would
 * time out. So this reads once, resolves outside any lock, then applies the
 * results in a second, fast, lock-scoped write against whatever is current
 * by then.
 */
export async function reconcileFindingResolutions(
  workspaceRoot: string,
  stillOpen: FindingStillOpen,
): Promise<JobRecord[]> {
  await reapJobs(workspaceRoot);
  const jobs = await loadJobs(workspaceRoot);
  const pending = pendingFindingJobs(jobs);
  if (pending.length === 0) return jobs;

  const resolutions = new Map<string, "resolved" | "open">();
  for (const job of pending) {
    const open = await stillOpen({
      fingerprint: job.findingFingerprint,
      workspaceRoot,
    });
    resolutions.set(job.id, open ? "open" : "resolved");
  }

  return await updateJobs(workspaceRoot, (current) => {
    const next = current.map((job) => {
      // Only apply to a job that is still pending by the time the (possibly
      // slow) resolve above finished — one that resolved some other way in
      // the meantime keeps whatever it already has.
      if (!resolutions.has(job.id) || job.findingResolution) return job;
      return { ...job, findingResolution: resolutions.get(job.id)! };
    });
    return { jobs: next, result: next };
  });
}
