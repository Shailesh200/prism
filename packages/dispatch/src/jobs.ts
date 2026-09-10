import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, open, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { withLifecycleEvents } from "./lifecycle.js";
import {
  JobRecordSchema,
  isClockStoppedStatus,
  type JobRecord,
} from "./types.js";
import { jobsPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

type JobsFile = { jobs: JobRecord[] };

const LOCK_WAIT_MS = 5_000;
const LOCK_RETRY_MS = 15;

/** Nested `updateJobs` on the same async chain may reenter; siblings must not. */
const lockOwner = new AsyncLocalStorage<string>();
/** Serialises concurrent claims inside one process (MCP kick + hub drain). */
const inProcessTail = new Map<string, Promise<void>>();

async function withJobsLock<T>(
  workspaceRoot: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockPath = `${jobsPath(workspaceRoot)}.lock`;
  if (lockOwner.getStore() === lockPath) {
    return await fn();
  }

  const prev = inProcessTail.get(lockPath) ?? Promise.resolve();
  let releaseQueue: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  inProcessTail.set(
    lockPath,
    prev.then(
      () => held,
      () => held,
    ),
  );
  await prev.catch(() => undefined);

  try {
    await mkdir(dirname(lockPath), { recursive: true });
    const started = Date.now();
    for (;;) {
      try {
        const handle = await open(lockPath, "wx");
        try {
          return await lockOwner.run(lockPath, fn);
        } finally {
          await handle.close();
          await unlink(lockPath).catch(() => undefined);
        }
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code;
        if (code !== "EEXIST" && code !== "EPERM") throw cause;
        if (Date.now() - started >= LOCK_WAIT_MS) {
          throw new Error("Prism could not update the job list (busy).");
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }
  } finally {
    releaseQueue();
  }
}

async function readJobsFile(workspaceRoot: string): Promise<JobRecord[]> {
  const file = await readJsonFile<JobsFile>(jobsPath(workspaceRoot), {
    jobs: [],
  });
  return (file.jobs ?? []).flatMap((job) => {
    const parsed = JobRecordSchema.safeParse(job);
    return parsed.success ? [parsed.data] : [];
  });
}

async function writeJobsFile(
  workspaceRoot: string,
  jobs: readonly JobRecord[],
): Promise<void> {
  await writeJsonFile(jobsPath(workspaceRoot), { jobs });
}

export async function loadJobs(workspaceRoot: string): Promise<JobRecord[]> {
  return await readJobsFile(workspaceRoot);
}

/**
 * Read-modify-write `jobs.json` under an exclusive lock so the hub drain and
 * the MCP `start_job` kick cannot both claim the same queued row.
 */
export async function updateJobs<T>(
  workspaceRoot: string,
  mutator: (
    jobs: JobRecord[],
  ) =>
    | { jobs: JobRecord[]; result: T }
    | Promise<{ jobs: JobRecord[]; result: T }>,
): Promise<T> {
  return await withJobsLock(workspaceRoot, async () => {
    const jobs = await readJobsFile(workspaceRoot);
    const next = await mutator(jobs);
    await writeJobsFile(workspaceRoot, next.jobs);
    return next.result;
  });
}

export async function saveJobs(
  workspaceRoot: string,
  jobs: readonly JobRecord[],
): Promise<void> {
  await updateJobs(workspaceRoot, () => ({
    jobs: [...jobs],
    result: undefined,
  }));
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

function applyUpsert(
  jobs: readonly JobRecord[],
  job: JobRecord,
  now: string,
): { jobs: JobRecord[]; stamped: JobRecord } {
  const prev = jobs.find((item) => item.id === job.id);
  const stamped = withLifecycleEvents(
    prev,
    { ...withLifecycleStamps(job, now), updatedAt: now },
    now,
  );
  const next = [...jobs.filter((item) => item.id !== job.id), stamped];
  return { jobs: next, stamped };
}

export async function upsertJob(
  workspaceRoot: string,
  job: JobRecord,
): Promise<JobRecord> {
  const now = new Date().toISOString();
  return await updateJobs(workspaceRoot, (jobs) => {
    const applied = applyUpsert(jobs, job, now);
    return { jobs: applied.jobs, result: applied.stamped };
  });
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
  return await updateJobs(workspaceRoot, (jobs) => {
    const removed = jobs.find(
      (job) => job.id === id || job.id.toLowerCase() === id.toLowerCase(),
    );
    if (!removed) return { jobs, result: undefined };
    return {
      jobs: jobs.filter((job) => job.id !== removed.id),
      result: removed,
    };
  });
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
 * Hub drain and the MCP `start_job` kick race across processes. The jobs-file
 * lock is the claim: the loser sees `booting` and backs off.
 *
 * Returns the claimed job, or `undefined` if someone else got there first.
 */
export async function claimQueuedJob(
  workspaceRoot: string,
  jobId: string,
): Promise<JobRecord | undefined> {
  const now = new Date().toISOString();
  return await updateJobs(workspaceRoot, (jobs) => {
    const job = jobs.find((item) => item.id === jobId);
    if (!job || job.status !== "queued") {
      return { jobs, result: undefined };
    }
    // Deliberately no `startedAt` here. Booting is git setup and sign-in,
    // which is pipeline overhead, not agent work.
    const applied = applyUpsert(jobs, { ...job, status: "booting" }, now);
    return { jobs: applied.jobs, result: applied.stamped };
  });
}
