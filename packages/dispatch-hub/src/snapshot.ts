import type { JobRecord } from "@repo-prism/dispatch";
import { workspaceLabel } from "./registry.js";
import type { JobSnapshot } from "./types.js";

/**
 * Chat-safe job row. Never includes a worktree path (ADR-0039).
 *
 * Deliberately carries **no computed duration** (M-067 P-S1). The server used
 * to send `elapsedMs`, which broke three ways at once: it only changed when a
 * job's snapshot key changed, so it froze and then jumped; every snapshot
 * recomputed *all* rows against `Date.now()`, so a finished job's time kept
 * growing whenever any unrelated job updated; and the statusline measured from
 * a different field, so one job showed two durations in two places.
 *
 * Shipping the raw timestamps and letting each client tick locally through
 * `jobDurations` in `@repo-prism/shared` removes all three at once.
 */
export function toSnapshot(job: JobRecord, workspacePath: string): JobSnapshot {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    workspacePath,
    workspaceLabel: workspaceLabel(workspacePath),
    branch: job.branch,
    lastActivity: job.lastActivity ?? "",
    ...(job.resultSummary ? { resultSummary: job.resultSummary } : {}),
    ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
    ...(job.verification ? { verification: job.verification } : {}),
    ...(job.verificationDetail
      ? { verificationDetail: job.verificationDetail }
      : {}),
    ...(job.commitSha ? { commitSha: job.commitSha } : {}),
    // Without this the board can show that a job finished but never what it
    // changed, which is the one thing a reviewer needs.
    ...(job.review ? { review: job.review } : {}),
    ...(job.nextStep ? { nextStep: job.nextStep } : {}),
    // Whether a teammate is in your working tree is not a detail: it is the
    // difference between "safe to keep editing" and "do not touch this repo".
    ...(job.placement ? { placement: job.placement } : {}),
    ...(job.worktreePath ? { worktreePath: job.worktreePath } : {}),
    ...(job.waitingOn ? { waitingOn: job.waitingOn } : {}),
    ...(job.lastHeartbeat ? { lastHeartbeat: job.lastHeartbeat } : {}),
    // The gate question travels with the row so the board can render a Confirm
    // action instead of the job silently never starting (ADR-0047).
    ...(job.confirm ? { confirm: job.confirm } : {}),
    createdAt: job.createdAt,
    ...(job.queuedAt ? { queuedAt: job.queuedAt } : {}),
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    updatedAt: job.updatedAt,
    ...(job.workerBackend ? { workerBackend: job.workerBackend } : {}),
    ...(job.workerModel ? { workerModel: job.workerModel } : {}),
    ...(job.workerThinking ? { workerThinking: job.workerThinking } : {}),
    ...(job.notes?.length ? { notes: job.notes } : {}),
    ...(job.citedMissing?.length ? { citedMissing: job.citedMissing } : {}),
  };
}

export function snapshotKey(job: JobSnapshot): string {
  return [
    job.id,
    job.status,
    job.lastActivity,
    job.verification ?? "",
    job.commitSha ?? "",
    // A review arriving is a visible change; leaving it out of the key means
    // the board would not re-render when the file list lands.
    job.review ? String(job.review.files.length) : "",
    job.review?.keptPaths?.length ? String(job.review.keptPaths.length) : "",
    job.updatedAt,
  ].join(":");
}

export function finishedKey(job: JobSnapshot): string {
  return `${job.workspacePath}:${job.id}:${job.status}:${job.updatedAt}`;
}
