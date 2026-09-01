import type { JobRecord } from "@repo-prism/dispatch";
import { workspaceLabel } from "./registry.js";
import type { JobSnapshot } from "./types.js";

function elapsedMs(createdAt: string, now: number): number {
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, now - started);
}

/** Chat-safe job row. Never includes a worktree path (ADR-0039). */
export function toSnapshot(
  job: JobRecord,
  workspacePath: string,
  now = Date.now(),
): JobSnapshot {
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
    ...(job.waitingOn ? { waitingOn: job.waitingOn } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    elapsedMs: elapsedMs(job.createdAt, now),
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
    job.updatedAt,
  ].join(":");
}

export function finishedKey(job: JobSnapshot): string {
  return `${job.workspacePath}:${job.id}:${job.status}:${job.updatedAt}`;
}
