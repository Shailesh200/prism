import { AsyncLocalStorage } from "node:async_hooks";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { withLifecycleEvents } from "./lifecycle.js";
import { listGitWorktrees } from "./git.js";
import {
  JobRecordSchema,
  isClockStoppedStatus,
  type JobRecord,
} from "./types.js";
import {
  globalWorkspacesDir,
  jobsMetaPath,
  jobsPath,
  legacyJobsPath,
  useGlobalJobStore,
} from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

type JobsFile = { jobs: JobRecord[] };

type JobsMeta = {
  readonly path: string;
  readonly migratedAt?: string;
};

const LOCK_WAIT_MS = 5_000;
const LOCK_RETRY_MS = 15;
const QUEUE_WAIT_MS = 8_000;

/** Nested `updateJobs` on the same async chain may reenter; siblings must not. */
const lockOwner = new AsyncLocalStorage<string>();
/** Serialises concurrent claims inside one process (MCP kick + hub drain). */
const inProcessTail = new Map<string, Promise<void>>();
/** Tests inject PRISM_HOME without mutating process.env for other files. */
const jobsEnvStore = new AsyncLocalStorage<NodeJS.ProcessEnv>();

function jobsEnv(): NodeJS.ProcessEnv {
  return jobsEnvStore.getStore() ?? process.env;
}

export function runWithJobsEnv<T>(env: NodeJS.ProcessEnv, fn: () => T): T {
  return jobsEnvStore.run(env, fn);
}

async function withJobsLock<T>(
  workspaceRoot: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockPath = `${jobsPath(workspaceRoot, jobsEnv())}.lock`;
  if (lockOwner.getStore() === lockPath) {
    return await fn();
  }

  const prev = inProcessTail.get(lockPath) ?? Promise.resolve();
  let releaseQueue: () => void = () => undefined;
  const held = new Promise<void>((releaseHeld) => {
    releaseQueue = releaseHeld;
  });
  inProcessTail.set(
    lockPath,
    prev.then(
      () => held,
      () => held,
    ),
  );
  await Promise.race([
    prev.catch(() => undefined),
    new Promise<void>((finishWait) => {
      setTimeout(finishWait, QUEUE_WAIT_MS);
    }),
  ]);

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
        const stale = await stat(lockPath).catch(() => undefined);
        if (stale && Date.now() - stale.mtimeMs >= LOCK_WAIT_MS) {
          await unlink(lockPath).catch(() => undefined);
          continue;
        }
        if (Date.now() - started >= LOCK_WAIT_MS) {
          throw new Error("Prism could not update the job list (busy).", {
            cause,
          });
        }
        await new Promise<void>((retryWait) => {
          setTimeout(retryWait, LOCK_RETRY_MS);
        });
      }
    }
  } finally {
    releaseQueue();
  }
}

function parseJobRecords(jobs: unknown): JobRecord[] {
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap((job) => {
    const parsed = JobRecordSchema.safeParse(job);
    return parsed.success ? [parsed.data] : [];
  });
}

function mergeJobLists(
  primary: readonly JobRecord[],
  extra: readonly JobRecord[],
  opts?: { readonly preferExtraOnTie?: boolean },
): JobRecord[] {
  const byId = new Map(primary.map((job) => [job.id, job]));
  for (const job of extra) {
    const existing = byId.get(job.id);
    if (!existing) {
      byId.set(job.id, job);
      continue;
    }
    const existingAt = Date.parse(existing.updatedAt);
    const nextAt = Date.parse(job.updatedAt);
    const baseline = Number.isFinite(existingAt) ? existingAt : 0;
    if (
      Number.isFinite(nextAt) &&
      (nextAt > baseline || (opts?.preferExtraOnTie && nextAt === baseline))
    ) {
      byId.set(job.id, job);
    }
  }
  return [...byId.values()];
}

async function retireLegacyJobsFile(path: string): Promise<void> {
  const retired = `${path}.migrated`;
  try {
    await rename(path, retired);
    return;
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
  }
  await unlink(retired).catch(() => undefined);
  try {
    await rename(path, retired);
  } catch {
    // Keep the live file. The global store is already the source of truth.
  }
}

type JobsRead = { readonly present: boolean; readonly jobs: JobRecord[] };

async function readJobsIfPresent(path: string): Promise<JobsRead> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return { present: false, jobs: [] };
    }
    throw cause;
  }
  if (!raw.trim()) {
    throw new Error("jobs.json is empty");
  }
  const parsed = JSON.parse(raw) as JobsFile;
  return { present: true, jobs: parseJobRecords(parsed.jobs) };
}

async function readJobRecordsFromPath(path: string): Promise<JobRecord[]> {
  return (await readJobsIfPresent(path)).jobs;
}

async function readLegacyJobs(root: string): Promise<JobRecord[]> {
  try {
    return await readJobRecordsFromPath(legacyJobsPath(root));
  } catch {
    return [];
  }
}

async function readRetiredJobs(root: string): Promise<JobRecord[]> {
  try {
    return await readJobRecordsFromPath(`${legacyJobsPath(root)}.migrated`);
  } catch {
    return [];
  }
}

async function workspaceJobCandidates(
  workspaceRoot: string,
): Promise<string[]> {
  const candidates = [workspaceRoot];
  const trees = await listGitWorktrees(workspaceRoot).catch(() => []);
  for (const tree of trees) {
    if (tree.path && !candidates.includes(tree.path)) {
      candidates.push(tree.path);
    }
  }
  return candidates;
}

/**
 * Lift `{repo}/.prism/dispatch/jobs.json` (and worktree copies) into
 * `~/.prism/dispatch/workspaces/`. Persist the global file before retiring
 * leftovers so a crash cannot leave jobs only in `.migrated`.
 */
async function migrateLegacyJobs(workspaceRoot: string): Promise<void> {
  const env = jobsEnv();
  if (!useGlobalJobStore(env)) return;
  const dest = jobsPath(workspaceRoot, env);
  const metaPath = jobsMetaPath(workspaceRoot, env);
  const meta = await readJsonFile<JobsMeta>(metaPath, {
    path: resolve(workspaceRoot),
  });
  const destRead = await readJobsIfPresent(dest);
  let merged = destRead.jobs;
  const candidates = await workspaceJobCandidates(workspaceRoot);
  let recovered = false;
  if (!destRead.present) {
    for (const root of candidates) {
      const retired = await readRetiredJobs(root);
      if (retired.length === 0) continue;
      merged = mergeJobLists(merged, retired, { preferExtraOnTie: true });
      recovered = true;
    }
  }
  const livePaths: string[] = [];
  for (const root of candidates) {
    const legacy = await readLegacyJobs(root);
    if (legacy.length === 0) continue;
    merged = mergeJobLists(merged, legacy, { preferExtraOnTie: true });
    livePaths.push(legacyJobsPath(root));
  }
  if (
    livePaths.length > 0 ||
    recovered ||
    (destRead.present && !meta.migratedAt)
  ) {
    await writeJsonFile(dest, { jobs: merged });
    await writeJsonFile(metaPath, {
      path: resolve(workspaceRoot),
      migratedAt: new Date().toISOString(),
    });
    for (const path of livePaths) {
      await retireLegacyJobsFile(path);
    }
  }
}

async function readJobsFile(workspaceRoot: string): Promise<JobRecord[]> {
  return await readJobRecordsFromPath(jobsPath(workspaceRoot, jobsEnv()));
}

async function writeJobsFile(
  workspaceRoot: string,
  jobs: readonly JobRecord[],
): Promise<void> {
  const env = jobsEnv();
  await writeJsonFile(jobsPath(workspaceRoot, env), { jobs });
  if (useGlobalJobStore(env)) {
    await writeJsonFile(jobsMetaPath(workspaceRoot, env), {
      path: resolve(workspaceRoot),
      migratedAt: new Date().toISOString(),
    });
  }
}

export async function loadJobs(workspaceRoot: string): Promise<JobRecord[]> {
  return await withJobsLock(workspaceRoot, async () => {
    await migrateLegacyJobs(workspaceRoot);
    return await readJobsFile(workspaceRoot);
  });
}

/** Workspace roots that already have a global jobs file (ADR-0054). */
export async function listStoredWorkspaceRoots(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  if (!useGlobalJobStore(env)) return [];
  try {
    const names = await readdir(globalWorkspacesDir(env));
    const paths: string[] = [];
    for (const name of names) {
      const meta = await readJsonFile<JobsMeta>(
        join(globalWorkspacesDir(env), name, "meta.json"),
        { path: "" },
      );
      if (meta.path.trim()) paths.push(meta.path);
    }
    return paths;
  } catch {
    return [];
  }
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
    await migrateLegacyJobs(workspaceRoot);
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
