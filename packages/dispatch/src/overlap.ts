import { gitStatusShort, type GitRunner } from "./git.js";
import type { JobRecord } from "./types.js";

export type Overlap = {
  readonly path: string;
  readonly existingJobId: string;
  readonly dirty: boolean;
};

export async function findPathOverlap(input: {
  readonly jobs: readonly JobRecord[];
  readonly path: string;
  readonly ignoreJobId?: string;
  readonly git?: GitRunner;
}): Promise<Overlap | undefined> {
  const other = input.jobs.find(
    (job) =>
      job.worktreePath === input.path &&
      job.id !== input.ignoreJobId &&
      job.status !== "done" &&
      job.status !== "cancelled",
  );
  if (!other) return undefined;
  const status = await gitStatusShort(input.path, input.git);
  return {
    path: input.path,
    existingJobId: other.id,
    dirty: status.length > 0,
  };
}
