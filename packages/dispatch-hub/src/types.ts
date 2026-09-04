import type { JobConfirm, JobRecord, JobReview } from "@repo-prism/dispatch";

export type JobStatus = JobRecord["status"];
export type { JobConfirm, JobReview };

export type HubRecord = {
  readonly port: number;
  readonly pid: number;
  readonly version: string;
  readonly token: string;
  readonly startedAt: string;
};

export type WorkspaceEntry = {
  readonly path: string;
  readonly label: string;
  readonly lastSeenAt: string;
};

export type WorkspaceRegistry = {
  readonly workspaces: readonly WorkspaceEntry[];
};

export type JobSnapshot = {
  readonly id: string;
  readonly title: string;
  readonly status: JobStatus;
  readonly workspacePath: string;
  readonly workspaceLabel: string;
  readonly branch: string;
  readonly lastActivity: string;
  readonly resultSummary?: string;
  readonly errorMessage?: string;
  readonly verification?: "passed" | "failed" | "skipped";
  readonly verificationDetail?: string;
  readonly commitSha?: string;
  /** What the job left for review. The board cannot show files without it. */
  readonly review?: JobReview;
  readonly nextStep?: string;
  /** checkout = editing your working tree; worktree = isolated branch. */
  readonly placement?: JobRecord["placement"];
  /**
   * Where the job's branch is checked out on disk.
   *
   * ADR-0039 keeps paths out of *chat*, because a spoken path is noise. A job
   * detail is the opposite case: it is the one place someone needs the path,
   * to go look at the branch themselves.
   */
  readonly worktreePath?: string;
  /** Why a job is waiting, e.g. "stalled". */
  readonly waitingOn?: string;
  /**
   * When the worker last wrote output. The evidence behind a `running` badge:
   * a status alone cannot say whether the process is still doing anything.
   */
  readonly lastHeartbeat?: string;
  /** The gate this job is parked on, when status is `needs_confirm`. */
  readonly confirm?: JobConfirm;
  /**
   * Raw timestamps only — no server-computed duration (M-067 P-S1). Clients
   * tick locally via `jobDurations` from `@repo-prism/shared`, which is what
   * makes a running job advance smoothly and a finished job stay put.
   */
  readonly createdAt: string;
  readonly queuedAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
  /** Agent CLI that ran this job. Absent on older records. */
  readonly workerBackend?: JobRecord["workerBackend"];
  /** Model id the worker reported. */
  readonly workerModel?: string;
  /** Thinking / effort the worker reported. */
  readonly workerThinking?: string;
  /** Write-ups under `.prism/dispatch/notes/`. */
  readonly notes?: readonly string[];
  /** Cited paths the agent claimed but did not write. */
  readonly citedMissing?: readonly string[];
};

/** A workspace the Console could not read, and why. */
export type WorkspaceError = {
  readonly workspacePath: string;
  readonly label: string;
  readonly detail: string;
};

export type HubEvent =
  | {
      readonly type: "snapshot";
      readonly jobs: readonly JobSnapshot[];
      /**
       * When this list was read. The client shows it, and marks itself stale
       * when SSE drops, rather than presenting a frozen list as current
       * (ADR-0048).
       */
      readonly asOf: string;
      /**
       * Workspaces that failed to read. These used to be swallowed, so a repo
       * whose `.prism/dispatch` went unreadable looked exactly like a repo
       * with no jobs.
       */
      readonly errors: readonly WorkspaceError[];
    }
  | { readonly type: "job.updated"; readonly job: JobSnapshot }
  | {
      readonly type: "job.finished";
      readonly job: JobSnapshot;
      readonly notice: string;
    }
  | { readonly type: "job.removed"; readonly job: JobSnapshot };

export const IN_FLIGHT_STATUSES: readonly JobStatus[] = [
  // Accepted work the user is waiting on, whether or not a process exists yet.
  // `queued` and `needs_confirm` belong here: leaving them out is what let the
  // header say "nothing running" above a list with rows in it.
  "queued",
  "needs_confirm",
  "ready",
  "booting",
  "running",
  "waiting_on_you",
  "blocked",
];

export const TERMINAL_STATUSES: readonly JobStatus[] = [
  "done",
  "error",
  "cancelled",
  // The teammate has stopped and is waiting on a human decision. Leaving this
  // out meant the one state that needs you never raised a finish notification,
  // and the hub could idle out while a review sat unread.
  "needs_review",
];
