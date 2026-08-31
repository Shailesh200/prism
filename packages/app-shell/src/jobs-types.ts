/**
 * Dispatch job shapes as the UI needs them.
 *
 * Declared structurally rather than imported from `@repo-prism/dispatch`: this
 * package is presentation for every surface, and Dispatch is a host concern
 * (ADR-0035). The host passes data in; the screen never opens a worktree.
 */

export type JobRunPhase =
  | "starting"
  | "running"
  | "thinking"
  | "tool"
  | "editing"
  | "done"
  | "failed"
  | "cancelled";

export type JobStatus =
  | "ready"
  | "booting"
  | "running"
  | "waiting_on_you"
  | "blocked"
  | "paused"
  | "needs_review"
  | "done"
  | "cancelled"
  | "error";

export type JobReviewFileChange =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked";

export type JobReviewFile = {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
  readonly change: JobReviewFileChange;
};

export type JobReview = {
  readonly files: readonly JobReviewFile[];
  readonly totalAdded: number;
  readonly totalRemoved: number;
  readonly truncated: boolean;
  /** Branch holding the work. Never the branch the user is on. */
  readonly branch?: string;
  readonly baseRef?: string;
  /** True once the supervisor committed it (ADR-0042 §1). */
  readonly committed?: boolean;
  /** Always false: Prism does not merge a job for the user. */
  readonly merged?: false;
};

export type JobConsoleEntry = {
  readonly ts: string;
  readonly phase: JobRunPhase;
  readonly text: string;
  readonly tool?: string;
  readonly level: "info" | "error";
};

export type JobSummary = {
  readonly id: string;
  readonly title: string;
  readonly status: JobStatus;
  readonly branch: string;
  readonly startedAt?: string;
  readonly updatedAt?: string;
  readonly lastActivity?: string;
  readonly resultSummary?: string;
  readonly errorMessage?: string;
  readonly review?: JobReview;
};

export type JobConsolePage = {
  readonly entries: readonly JobConsoleEntry[];
  readonly totalCount: number;
  readonly truncated: boolean;
};

export type JobControlAction = "pause" | "resume" | "cancel";

/** What the host must provide for the Jobs screen to be live. */
export type JobsPort = {
  listJobs(): Promise<readonly JobSummary[]>;
  /** `since` is the ISO ts of the newest entry already shown. */
  jobLogs(jobId: string, since?: string): Promise<JobConsolePage>;
  control?(action: JobControlAction, jobId: string): Promise<void>;
};

const LIVE_STATUSES = new Set<JobStatus>([
  "ready",
  "booting",
  "running",
  "waiting_on_you",
  "blocked",
]);

export function isLiveJob(status: JobStatus): boolean {
  return LIVE_STATUSES.has(status);
}

export function jobStatusLabel(status: JobStatus): string {
  switch (status) {
    case "booting":
      return "Starting";
    case "waiting_on_you":
      return "Needs you";
    case "needs_review":
      return "Ready for review";
    case "blocked":
      return "Stuck";
    case "error":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "paused":
      return "Paused";
    case "done":
      return "Done";
    case "ready":
      return "Ready";
    default:
      return "Running";
  }
}

/** Grouping for the status pill colour. */
export function jobStatusTone(
  status: JobStatus,
): "live" | "attention" | "good" | "bad" | "idle" {
  switch (status) {
    case "running":
    case "booting":
    case "ready":
      return "live";
    case "waiting_on_you":
    case "blocked":
    case "needs_review":
      return "attention";
    case "done":
      return "good";
    case "error":
      return "bad";
    default:
      return "idle";
  }
}

/** Compact elapsed label ("4s", "12m", "1h 4m"). */
export function formatElapsed(
  fromIso: string | undefined,
  now: number,
): string {
  if (!fromIso) return "";
  const start = Date.parse(fromIso);
  if (!Number.isFinite(start)) return "";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function reviewFileTotals(review: JobReview): string {
  const count = review.files.length;
  const noun = count === 1 ? "file" : "files";
  return `${count}${review.truncated ? "+" : ""} ${noun} · +${review.totalAdded} -${review.totalRemoved}`;
}

/** Newest timestamp in a page, for the next `since` poll. */
export function newestEntryTs(
  entries: readonly JobConsoleEntry[],
): string | undefined {
  return entries.length > 0 ? entries[entries.length - 1]!.ts : undefined;
}

/** Append a tailed page, de-duplicating by timestamp+text. */
export function mergeConsoleEntries(
  existing: readonly JobConsoleEntry[],
  incoming: readonly JobConsoleEntry[],
  cap = 2_000,
): JobConsoleEntry[] {
  if (incoming.length === 0) return [...existing];
  const seen = new Set(existing.map((entry) => `${entry.ts}|${entry.text}`));
  const merged = [...existing];
  for (const entry of incoming) {
    const key = `${entry.ts}|${entry.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged.length > cap ? merged.slice(-cap) : merged;
}
