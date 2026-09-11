import { access } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { dirname, join } from "node:path";
import {
  jobsPath,
  listStoredWorkspaceRoots,
  reapJobs,
  runWithJobsEnv,
  useGlobalJobStore,
} from "@repo-prism/dispatch";
import { formatJobFinishedNotice } from "./notice.js";
import { mergeHubEnv } from "./paths.js";
import { mergeWorkspaceEntries } from "./registry.js";
import { finishedKey, snapshotKey, toSnapshot } from "./snapshot.js";
import {
  IN_FLIGHT_STATUSES,
  TERMINAL_STATUSES,
  type HubEvent,
  type JobSnapshot,
  type WorkspaceEntry,
  type WorkspaceError,
} from "./types.js";

export type { WorkspaceError };

const DEBOUNCE_MS = 250;
const POLL_MS = 2_000;

export type WatchEmit = (event: HubEvent) => void;

export type CollectResult = {
  readonly jobs: JobSnapshot[];
  readonly errors: WorkspaceError[];
};

export type WorkspaceWatch = {
  readonly refresh: (opts?: { drain?: boolean }) => Promise<void>;
  readonly close: () => void;
  readonly jobs: () => readonly JobSnapshot[];
  readonly errors: () => readonly WorkspaceError[];
  /** When the last successful read completed — the board's "as of" time. */
  readonly asOf: () => string;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function isInFlight(job: JobSnapshot): boolean {
  return IN_FLIGHT_STATUSES.includes(job.status);
}

export function isTerminal(job: JobSnapshot): boolean {
  return TERMINAL_STATUSES.includes(job.status);
}

/**
 * Read every registered workspace.
 *
 * Failures are **reported, not swallowed** (M-067 P-S2 data integrity). The
 * old empty `catch` meant a repo whose `.prism/dispatch` had gone unreadable
 * simply vanished from the board with no explanation — indistinguishable from
 * a repo with no jobs. Now the caller gets the error and the UI can say which
 * workspace it could not read.
 */
export async function collectJobs(
  workspaces: readonly WorkspaceEntry[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<CollectResult> {
  const listed = mergeWorkspaceEntries(
    workspaces,
    await listStoredWorkspaceRoots(env),
  );
  const jobs: JobSnapshot[] = [];
  const errors: WorkspaceError[] = [];
  for (const entry of listed) {
    try {
      const records = await runWithJobsEnv(env, () => reapJobs(entry.path));
      for (const record of records) {
        jobs.push(toSnapshot(record, entry.path));
      }
    } catch (cause) {
      errors.push({
        workspacePath: entry.path,
        label: entry.label,
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  return { jobs, errors };
}

/**
 * Diff two snapshots. `job.finished` fires once per terminal transition
 * (deduped by workspace+id+status+updatedAt).
 */
function jobKey(job: Pick<JobSnapshot, "workspacePath" | "id">): string {
  return `${job.workspacePath}:${job.id}`;
}

export function diffJobs(
  previous: readonly JobSnapshot[],
  next: readonly JobSnapshot[],
  seenFinished: Set<string>,
): HubEvent[] {
  const prevById = new Map(previous.map((job) => [jobKey(job), job]));
  const nextKeys = new Set(next.map(jobKey));
  const events: HubEvent[] = [];
  for (const job of next) {
    const key = jobKey(job);
    const before = prevById.get(key);
    if (!before) {
      events.push({ type: "job.updated", job });
    } else if (snapshotKey(before) !== snapshotKey(job)) {
      events.push({ type: "job.updated", job });
    }
    if (isTerminal(job) && before && !isTerminal(before)) {
      const finish = finishedKey(job);
      if (!seenFinished.has(finish)) {
        seenFinished.add(finish);
        const copy = formatJobFinishedNotice(job);
        events.push({
          type: "job.finished",
          job,
          notice: `${copy.title}. ${copy.body}`,
        });
      }
    }
  }
  for (const job of previous) {
    if (!nextKeys.has(jobKey(job))) {
      events.push({ type: "job.removed", job });
    }
  }
  return events;
}

export function watchWorkspaces(
  getWorkspaces: () => readonly WorkspaceEntry[],
  emit: WatchEmit,
  options: {
    readonly debounceMs?: number | undefined;
    readonly pollMs?: number | undefined;
    readonly env?: NodeJS.ProcessEnv | undefined;
    /** Advance the job queue for one workspace before reading it (ADR-0047). */
    readonly drain?: ((workspacePath: string) => Promise<void>) | undefined;
  } = {},
): WorkspaceWatch {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  const pollMs = options.pollMs ?? POLL_MS;
  const env = mergeHubEnv(options.env);
  let snapshots: JobSnapshot[] = [];
  let workspaceErrors: WorkspaceError[] = [];
  let asOf = new Date().toISOString();
  const seenFinished = new Set<string>();
  const watchers = new Map<string, FSWatcher[]>();
  let extraPaths: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const listed = (): readonly WorkspaceEntry[] =>
    mergeWorkspaceEntries(getWorkspaces(), extraPaths);

  const applySnapshot = async (): Promise<void> => {
    if (closed) return;
    extraPaths = await listStoredWorkspaceRoots(env);
    const { jobs: collected, errors } = await collectJobs(getWorkspaces(), env);
    const failed = new Set(errors.map((row) => row.workspacePath));
    const next = [
      ...collected,
      ...snapshots.filter(
        (job) =>
          failed.has(job.workspacePath) &&
          !collected.some(
            (row) =>
              row.id === job.id && row.workspacePath === job.workspacePath,
          ),
      ),
    ];
    const events = diffJobs(snapshots, next, seenFinished);
    const errorsChanged =
      errors.length !== workspaceErrors.length ||
      errors.some((row, i) => row.detail !== workspaceErrors[i]?.detail);
    snapshots = next;
    workspaceErrors = errors;
    asOf = new Date().toISOString();
    if (events.length > 0 || errorsChanged) {
      emit({ type: "snapshot", jobs: next, asOf, errors });
      for (const event of events) emit(event);
    }
  };

  const runDrain = async (): Promise<void> => {
    if (!options.drain) return;
    for (const entry of listed()) {
      if (closed) return;
      await options.drain(entry.path).catch(() => {
        /* a failed drain leaves the job queued; the next tick retries */
      });
    }
  };

  const refresh = async (opts?: { drain?: boolean }): Promise<void> => {
    if (closed) return;
    // Drain so a queued job can become running (ADR-0047). Await it only when
    // the caller just enqueued work (`drain: true`). The poll tick and
    // workspace register must not wait — a slow worker-auth drain would freeze
    // GET /api/jobs, which is how the board and these tests observe disk.
    // Control actions (delete) skip drain so the board does not wait on a
    // spawn just to drop a row that is already gone from disk.
    if (opts?.drain === true && options.drain) {
      await runDrain();
    } else if (opts?.drain !== false && options.drain) {
      void runDrain().then(() => {
        void applySnapshot();
      });
    }
    await applySnapshot();
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void refresh();
    }, debounceMs);
    timer.unref?.();
  };

  const syncWatchers = (): void => {
    const live = new Set(listed().map((entry) => entry.path));
    for (const [path, group] of watchers) {
      if (live.has(path)) continue;
      for (const watcher of group) watcher.close();
      watchers.delete(path);
    }
    for (const path of live) {
      if (watchers.has(path)) continue;
      const group: FSWatcher[] = [];
      const dispatch = join(path, ".prism", "dispatch");
      const runs = join(dispatch, "runs");
      const targets = [dispatch, runs];
      if (useGlobalJobStore(env)) {
        targets.push(dirname(jobsPath(path, env)));
      }
      for (const target of targets) {
        try {
          const watcher = watch(target, { persistent: false }, () =>
            schedule(),
          );
          watcher.on("error", () => {
            /* directory may not exist yet */
          });
          group.push(watcher);
        } catch {
          /* watch is best-effort; poll covers it */
        }
      }
      watchers.set(path, group);
    }
  };

  void (async () => {
    extraPaths = await listStoredWorkspaceRoots(env);
    const initial = await collectJobs(getWorkspaces(), env);
    snapshots = initial.jobs;
    workspaceErrors = initial.errors;
    asOf = new Date().toISOString();
    for (const job of snapshots) {
      if (isTerminal(job)) seenFinished.add(finishedKey(job));
    }
    emit({ type: "snapshot", jobs: snapshots, asOf, errors: workspaceErrors });
    syncWatchers();
    if (closed) return;
    poll = setInterval(() => {
      syncWatchers();
      void refresh();
    }, pollMs);
    poll.unref?.();
  })();

  return {
    refresh,
    jobs: () => snapshots,
    errors: () => workspaceErrors,
    asOf: () => asOf,
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      for (const group of watchers.values()) {
        for (const watcher of group) watcher.close();
      }
      watchers.clear();
    },
  };
}

export { pathExists };
