/**
 * One duration vocabulary for every surface (M-067 P-S1).
 *
 * Before this module the jobs board, the Claude statusline and the app-shell
 * each carried their own formatter on a different basis, so one job could show
 * three different numbers in three places. Everything that renders a job
 * duration now goes through here.
 *
 * Two rules the audit forced:
 *
 * 1. **Unknown is not zero.** A timestamp that will not parse renders as
 *    `undefined`, never as a confident `0s` (ADR-0029 signal provenance,
 *    extended to the jobs surface).
 * 2. **Seconds exist at every scale.** The statusline used to floor to whole
 *    minutes, so a 40-second job read as `0m`.
 */

/** Milliseconds between two ISO timestamps, or `undefined` if either is unusable. */
export function durationMs(
  fromIso: string | undefined,
  toIso: string | number | undefined,
): number | undefined {
  if (!fromIso) return undefined;
  const start = Date.parse(fromIso);
  if (!Number.isFinite(start)) return undefined;
  const end =
    typeof toIso === "number" ? toIso : toIso ? Date.parse(toIso) : Number.NaN;
  if (!Number.isFinite(end)) return undefined;
  return Math.max(0, end - start);
}

/**
 * Compact duration label: `"4s"`, `"12m 30s"`, `"1h 4m"`.
 *
 * Returns `undefined` for unknown input so callers must decide what to render,
 * rather than being handed a plausible-looking zero.
 */
export function formatDuration(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
}

/** `formatDuration` with an explicit placeholder for unknown. Defaults to an en dash. */
export function formatDurationOr(
  ms: number | undefined,
  placeholder = "—",
): string {
  return formatDuration(ms) ?? placeholder;
}

/** The four timestamps a job carries once P-S1 splits them apart. */
export type JobTimestamps = {
  readonly createdAt: string;
  readonly queuedAt?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly finishedAt?: string | undefined;
  /**
   * The job's status, and when its record last changed.
   *
   * Only used to stop the clock on a job that ended before P-S1 existed and so
   * has no `finishedAt`. See `endOfLifeFor`.
   */
  readonly status?: string | undefined;
  readonly updatedAt?: string | undefined;
  /**
   * When the worker last wrote output. Stronger evidence of life than
   * `updatedAt`, which records the last write to the *record* — see
   * `endOfLifeFor`.
   */
  readonly lastHeartbeat?: string | undefined;
};

/**
 * Statuses during which a job's clock must not advance.
 *
 * A job in one of these states is not doing work, so counting wall-clock time
 * against it is a lie — and the most visible kind, because it is the number
 * the board renders largest.
 */
export const CLOCK_STOPPED_STATUSES: ReadonlySet<string> = new Set([
  "done",
  "cancelled",
  "error",
  "failed",
  "needs_review",
  "paused",
]);

/**
 * The instant a job's clock stops.
 *
 * Normally `finishedAt`. But records written before P-S1 have a terminal
 * status and no `finishedAt` at all, and treating those as live is what made a
 * job that ended yesterday render as "17h 30m" — a stopped job counting up
 * against the current time.
 *
 * For those, take the **last moment there is evidence the job was alive**. That
 * is not simply `updatedAt`: that field records the last write to the *record*,
 * and a supervisor that stamped the record once on creation and then never
 * again leaves it milliseconds after `createdAt`. `lastHeartbeat` is when the
 * worker last produced output, so a job whose record froze at +200ms but whose
 * worker was still writing at +8m demonstrably ran for eight minutes. Reporting
 * `0s` there is the same class of lie as `17h 30m`, in the other direction.
 *
 * A terminal status with no evidence at all yields `undefined`, meaning
 * "unknown" — which renders as an em dash rather than an invented duration.
 */
export function endOfLifeFor(
  job: JobTimestamps,
  now: number,
): number | string | undefined {
  if (job.finishedAt) return job.finishedAt;
  if (job.status && CLOCK_STOPPED_STATUSES.has(job.status)) {
    return latestOf(job.updatedAt, job.lastHeartbeat);
  }
  return now;
}

/** The later of two optional ISO stamps, ignoring any that will not parse. */
function latestOf(a?: string, b?: string): string | undefined {
  const at = a ? Date.parse(a) : Number.NaN;
  const bt = b ? Date.parse(b) : Number.NaN;
  if (!Number.isFinite(at)) return Number.isFinite(bt) ? b : undefined;
  if (!Number.isFinite(bt)) return a;
  return bt > at ? b : a;
}

/**
 * The three honest durations of a job.
 *
 * `total` is wall clock from creation, which is what a user means by "how long
 * did it take". `queued` and `working` split it, which is what tells you
 * whether the pipeline or the agent was slow.
 *
 * Every field is `undefined` when the timestamps needed to compute it are
 * missing — a job that never started has no `working` time, and saying `0s`
 * would be a lie rather than a measurement.
 */
export type JobDurations = {
  readonly queued: number | undefined;
  readonly working: number | undefined;
  readonly total: number | undefined;
  /** True while `working` (or `total`) is still advancing. */
  readonly live: boolean;
};

/**
 * Derive the three durations at instant `now`.
 *
 * A finished job **freezes**: every duration is measured against
 * `finishedAt`, so re-rendering the row later cannot make a completed job's
 * time keep growing. That growth was the second of the three clock defects.
 */
export function jobDurations(
  job: JobTimestamps,
  now: number = Date.now(),
): JobDurations {
  const queuedFrom = job.queuedAt ?? job.createdAt;
  const endOfLife = endOfLifeFor(job, now);
  const live = endOfLife === now;

  const queued = job.startedAt
    ? durationMs(queuedFrom, job.startedAt)
    : durationMs(queuedFrom, endOfLife);

  const working = job.startedAt
    ? durationMs(job.startedAt, endOfLife)
    : undefined;

  const total = durationMs(job.createdAt, endOfLife);

  return { queued, working, total, live };
}

/**
 * The one-line duration a compact surface shows (board row, statusline).
 *
 * While a job waits this reports the wait, because that is the number the user
 * is actually watching; once it starts, it reports work.
 */
export function primaryDurationMs(
  job: JobTimestamps,
  now: number = Date.now(),
): number | undefined {
  const { queued, working } = jobDurations(job, now);
  return working ?? queued;
}

/**
 * The long form for a job detail: `"12m (waited 9m, worked 3m)"`.
 *
 * Collapses to the bare total when the split adds nothing — a job that started
 * immediately should not be padded with `waited 0s`.
 */
export function formatJobDuration(
  job: JobTimestamps,
  now: number = Date.now(),
): string | undefined {
  const { queued, working, total } = jobDurations(job, now);
  const totalLabel = formatDuration(total);
  if (!totalLabel) return undefined;
  const queuedLabel = formatDuration(queued);
  const workingLabel = formatDuration(working);
  if (!workingLabel || !queuedLabel) return totalLabel;
  // A sub-second wait is noise, not information.
  if ((queued ?? 0) < 1000) return totalLabel;
  return `${totalLabel} (waited ${queuedLabel}, worked ${workingLabel})`;
}
