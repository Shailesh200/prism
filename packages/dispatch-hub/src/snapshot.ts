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
    job.updatedAt,
  ].join(":");
}

export function finishedKey(job: JobSnapshot): string {
  return `${job.workspacePath}:${job.id}:${job.status}:${job.updatedAt}`;
}
