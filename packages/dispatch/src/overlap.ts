import { resolve } from "node:path";
import { gitStatusShort, type GitRunner } from "./git.js";
import type { JobRecord, JobStatus } from "./types.js";

export type Overlap = {
  readonly path: string;
  readonly existingJobId: string;
  readonly existingTitle: string;
  readonly dirty: boolean;
};

/** A live teammate still occupies this folder. Finished/error jobs do not. */
export function jobOccupiesWorktree(status: JobStatus): boolean {
  return (
    status === "booting" ||
    status === "running" ||
    status === "ready" ||
    status === "paused" ||
    status === "waiting_on_you"
  );
}

/** True when two checkout folders are the same directory after resolve. */
export function sameWorktreePath(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  return resolve(a) === resolve(b);
}

export async function findPathOverlap(input: {
  readonly jobs: readonly JobRecord[];
  readonly path: string;
  readonly ignoreJobId?: string;
  readonly git?: GitRunner;
}): Promise<Overlap | undefined> {
  const other = input.jobs.find(
    (job) =>
      sameWorktreePath(job.worktreePath, input.path) &&
      job.id !== input.ignoreJobId &&
      jobOccupiesWorktree(job.status),
  );
  if (!other) return undefined;
  const status = await gitStatusShort(input.path, input.git);
  return {
    path: input.path,
    existingJobId: other.id,
    existingTitle: other.title,
    dirty: status.length > 0,
  };
}
