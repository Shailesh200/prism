import { access } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { reapJobs } from "@repo-prism/dispatch";
import { formatJobFinishedNotice } from "./notice.js";
import { finishedKey, snapshotKey, toSnapshot } from "./snapshot.js";
import {
  IN_FLIGHT_STATUSES,
  TERMINAL_STATUSES,
  type HubEvent,
  type JobSnapshot,
  type WorkspaceEntry,
} from "./types.js";

const DEBOUNCE_MS = 250;
const POLL_MS = 2_000;

export type WatchEmit = (event: HubEvent) => void;

export type WorkspaceWatch = {
  readonly refresh: () => Promise<void>;
  readonly close: () => void;
  readonly jobs: () => readonly JobSnapshot[];
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

export async function collectJobs(
  workspaces: readonly WorkspaceEntry[],
  now = Date.now(),
): Promise<JobSnapshot[]> {
  const jobs: JobSnapshot[] = [];
  for (const entry of workspaces) {
    try {
      const records = await reapJobs(entry.path);
      for (const record of records) {
        jobs.push(toSnapshot(record, entry.path, now));
      }
    } catch {
      /* a missing dispatch dir is not a hub failure */
    }
  }
  return jobs;
}

/**
 * Diff two snapshots. `job.finished` fires once per terminal transition
 * (deduped by workspace+id+status+updatedAt).
 */
export function diffJobs(
  previous: readonly JobSnapshot[],
  next: readonly JobSnapshot[],
  seenFinished: Set<string>,
): HubEvent[] {
  const prevById = new Map(
    previous.map((job) => [`${job.workspacePath}:${job.id}`, job]),
  );
  const events: HubEvent[] = [];
  for (const job of next) {
    const key = `${job.workspacePath}:${job.id}`;
    const before = prevById.get(key);
    if (!before) {
      events.push({ type: "job.updated", job });
    } else if (snapshotKey(before) !== snapshotKey(job)) {
      events.push({ type: "job.updated", job });
    }
    if (isTerminal(job) && (!before || !isTerminal(before))) {
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
  return events;
}

export function watchWorkspaces(
  getWorkspaces: () => readonly WorkspaceEntry[],
  emit: WatchEmit,
  options: {
    readonly debounceMs?: number | undefined;
    readonly pollMs?: number | undefined;
  } = {},
): WorkspaceWatch {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  const pollMs = options.pollMs ?? POLL_MS;
  let snapshots: JobSnapshot[] = [];
  const seenFinished = new Set<string>();
  const watchers = new Map<string, FSWatcher[]>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const refresh = async (): Promise<void> => {
    if (closed) return;
    const next = await collectJobs(getWorkspaces());
    const events = diffJobs(snapshots, next, seenFinished);
    snapshots = next;
    if (events.length > 0) {
      emit({ type: "snapshot", jobs: next });
      for (const event of events) emit(event);
    }
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void refresh();
    }, debounceMs);
    timer.unref?.();
  };

  const syncWatchers = (): void => {
    const live = new Set(getWorkspaces().map((entry) => entry.path));
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
      for (const target of [dispatch, runs]) {
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
    snapshots = await collectJobs(getWorkspaces());
    for (const job of snapshots) {
      if (isTerminal(job)) seenFinished.add(finishedKey(job));
    }
    emit({ type: "snapshot", jobs: snapshots });
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
