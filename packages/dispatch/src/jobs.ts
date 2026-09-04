import {
  JobRecordSchema,
  isClockStoppedStatus,
  type JobRecord,
} from "./types.js";
import { jobsPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

type JobsFile = { jobs: JobRecord[] };

export async function loadJobs(workspaceRoot: string): Promise<JobRecord[]> {
  const file = await readJsonFile<JobsFile>(jobsPath(workspaceRoot), {
    jobs: [],
  });
  return (file.jobs ?? []).flatMap((job) => {
    const parsed = JobRecordSchema.safeParse(job);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function saveJobs(
  workspaceRoot: string,
  jobs: readonly JobRecord[],
): Promise<void> {
  await writeJsonFile(jobsPath(workspaceRoot), { jobs });
}

/**
 * Stamp `finishedAt` on the transition into a terminal status, and clear it on
 * the way back out (a `needs_review` job that gets resumed is running again).
 *
 * Doing this centrally rather than at each call site is what makes the frozen
 * clock reliable: every path that ends a job goes through `upsertJob`, and
 * `jobDurations` needs `finishedAt` to stop counting.
 */
function withLifecycleStamps(job: JobRecord, nowIso: string): JobRecord {
  if (isClockStoppedStatus(job.status)) {
    return job.finishedAt ? job : { ...job, finishedAt: nowIso };
  }
  if (job.finishedAt) {
    const { finishedAt: _dropped, ...rest } = job;
    return rest as JobRecord;
  }
  return job;
}

export async function upsertJob(
  workspaceRoot: string,
  job: JobRecord,
): Promise<JobRecord> {
  const jobs = await loadJobs(workspaceRoot);
  const now = new Date().toISOString();
  const stamped = { ...withLifecycleStamps(job, now), updatedAt: now };
  const next = [...jobs.filter((item) => item.id !== job.id), stamped];
  await saveJobs(workspaceRoot, next);
  return next.find((item) => item.id === job.id) ?? stamped;
}

export async function getJob(
  workspaceRoot: string,
  id: string,
): Promise<JobRecord | undefined> {
  const jobs = await loadJobs(workspaceRoot);
  return jobs.find(
    (job) => job.id === id || job.id.toLowerCase() === id.toLowerCase(),
  );
}

/**
 * Remove a job from the durable list.
 *
 * Cancel keeps a tombstone so chat and the board can say what happened.
 * Delete is for clearing finished or discarded work off the board entirely.
 * Returns the removed record, or `undefined` when nothing matched.
 */
export async function deleteJob(
  workspaceRoot: string,
  id: string,
): Promise<JobRecord | undefined> {
  const jobs = await loadJobs(workspaceRoot);
  const removed = jobs.find(
    (job) => job.id === id || job.id.toLowerCase() === id.toLowerCase(),
  );
  if (!removed) return undefined;
  await saveJobs(
    workspaceRoot,
    jobs.filter((job) => job.id !== removed.id),
  );
  return removed;
}

/**
 * Jobs consuming a worker slot right now.
 *
 * `ready` used to count (M-067 P-S1 removed it) and `queued` deliberately does
 * not. Both mean "accepted but no process yet", so counting them refused job
 * #2 while job #1 was still logging in — the cap is about concurrent workers,
 * not about accepted work. A queued job simply waits for a slot instead.
 */
export function activeJobCount(jobs: readonly JobRecord[]): number {
  return jobs.filter(
    (job) =>
      job.status === "running" ||
      job.status === "booting" ||
      job.status === "waiting_on_you",
  ).length;
}

/** Jobs waiting for the drain loop, oldest first so the queue is fair. */
export function queuedJobs(jobs: readonly JobRecord[]): JobRecord[] {
  return jobs
    .filter((job) => job.status === "queued")
    .sort(
      (a, b) =>
        Date.parse(a.queuedAt ?? a.createdAt) -
        Date.parse(b.queuedAt ?? b.createdAt),
    );
}

/**
 * Move a queued job to `booting`, but only if it is still queued.
 *
 * This is the claim step of the drain loop. Re-reading immediately before the
 * write keeps two drains (the in-process kick and the hub tick) from starting
 * the same worker twice. `writeJsonFile` is atomic, so the loser of a race
 * sees the winner's `booting` and backs off.
 *
 * Returns the claimed job, or `undefined` if someone else got there first.
 */
export async function claimQueuedJob(
  workspaceRoot: string,
  jobId: string,
): Promise<JobRecord | undefined> {
  const jobs = await loadJobs(workspaceRoot);
  const job = jobs.find((item) => item.id === jobId);
  if (!job || job.status !== "queued") return undefined;
  // Deliberately no `startedAt` here. Booting is git setup and sign-in, which
  // is pipeline overhead, not agent work — stamping it now would charge a
  // 180-second login to the agent. `startedAt` lands on the `running`
  // transition, so `working` time means what a reader assumes it means.
  return await upsertJob(workspaceRoot, { ...job, status: "booting" });
}
