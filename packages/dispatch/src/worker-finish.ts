/**
 * How a worker run ends — the same for every backend (ADR-0042, ADR-0044 §7),
 * now forked on placement (ADR-0045).
 *
 * The agent (Cursor SDK or Claude CLI) never commits and never runs checks.
 * When it stops, the worker child calls these. Worktree placement: commit the
 * worktree onto the job branch, run checks, leave a review the human lands.
 * Checkout placement: no commit — the edits stay uncommitted in the user's
 * tree, checks run against the live tree, and the review subtracts whatever
 * was already dirty at dispatch.
 */

import {
  commitJobWork,
  committedJobPaths,
  gitChangeSummary,
  gitCheckoutReview,
  gitReviewSummary,
} from "./git.js";
import {
  auditCitedPaths,
  fabricationNote,
  notePathsOf,
  type PathAudit,
} from "./job-artifacts.js";
import { verifyJobWork } from "./job-verify.js";
import { publicRunFailure } from "./job-voice.js";
import { composeJobResult, type RunState } from "./run-state.js";
import type { JobPlacement } from "./types.js";

export type WorkerFinishInput = {
  readonly jobId: string;
  /** The job worktree, or the user's checkout for placement=checkout. */
  readonly cwd: string;
  readonly workspaceRoot: string;
  readonly title?: string;
  readonly baseRef?: string;
  readonly branch?: string;
  readonly verify?: boolean;
  /** Absent = worktree (the pre-M-066 default). */
  readonly placement?: JobPlacement;
  /** Checkout only: paths already dirty at dispatch (ADR-0045 §3). */
  readonly preExistingChanges?: readonly string[];
};

export type WorkerFinishDeps = {
  readonly patch: (
    partial: Partial<RunState>,
    options?: { immediate?: boolean },
  ) => Promise<unknown>;
  readonly logLine: (phase: RunState["phase"], text: string) => Promise<void>;
};

function auditSidecar(audit: PathAudit): {
  readonly notes?: string[];
  readonly citedMissing?: string[];
} {
  const notes = notePathsOf(audit);
  return {
    ...(notes.length > 0 ? { notes } : {}),
    ...(audit.missing.length > 0 ? { citedMissing: audit.missing } : {}),
  };
}

/** The agent reported failure: capture what the tree holds, then say so. */
export async function failWorkerRun(
  input: WorkerFinishInput,
  detail: string,
  deps: WorkerFinishDeps,
): Promise<void> {
  const checkout = input.placement === "checkout";
  const gitSummary = checkout ? "" : await gitChangeSummary(input.cwd);
  await deps.logLine("failed", detail || "the run failed");
  await deps.patch(
    {
      phase: "failed",
      errorMessage: publicRunFailure(detail || "the run failed"),
      gitSummary,
      resultSummary: checkout
        ? "Any edits it made are uncommitted in your working tree."
        : gitSummary,
      completedAt: new Date().toISOString(),
    },
    { immediate: true },
  );
}

/** The agent was cancelled mid-run. */
export async function cancelWorkerRunFinish(
  input: WorkerFinishInput,
  deps: WorkerFinishDeps,
): Promise<void> {
  const checkout = input.placement === "checkout";
  const gitSummary = checkout ? "" : await gitChangeSummary(input.cwd);
  await deps.logLine("cancelled", "Cancelled");
  await deps.patch(
    {
      phase: "cancelled",
      gitSummary,
      lastActivity: "Cancelled",
      completedAt: new Date().toISOString(),
    },
    { immediate: true },
  );
}

/**
 * The agent stopped normally, worktree placement. Commit before anything
 * else reads the tree: until the work is on the branch it is untracked in a
 * worktree the user is never told about, and pruning that worktree destroys
 * it (ADR-0042 §1).
 */
async function completeWorktreeRun(
  input: WorkerFinishInput,
  assistant: string,
  deps: WorkerFinishDeps,
): Promise<void> {
  await deps.patch({ lastActivity: "Saving work" });
  const commit = await commitJobWork(input.cwd, {
    jobId: input.jobId,
    title: input.title ?? input.jobId,
  });

  let verification: "passed" | "failed" | "skipped" = "skipped";
  let verificationDetail = "";
  if (commit.committed) {
    await deps.patch({ lastActivity: "Running checks" });
    const checked = await verifyJobWork(input.cwd, {
      enabled: input.verify !== false,
    });
    verification = checked.status;
    verificationDetail = checked.detail;
  }

  const baseRef = input.baseRef ?? "HEAD~1";
  const committedPaths = commit.committed
    ? await committedJobPaths(input.cwd, baseRef)
    : [];
  const audit = await auditCitedPaths({
    text: assistant,
    worktreePath: input.cwd,
    committedPaths,
  });

  // What the branch now carries, for the human to review. Read from the
  // commit range, not the tree: the commit above already cleaned it.
  const review = await gitReviewSummary(input.cwd, {
    baseRef,
    ...(input.branch ? { branch: input.branch } : {}),
  });

  await deps.logLine(
    "done",
    review.files.length > 0
      ? `Done — ${review.files.length} file(s) on the job branch, awaiting your review`
      : "Done — no reviewable change",
  );
  await deps.patch(
    {
      phase: "done",
      gitSummary: commit.summary,
      review,
      verification,
      verificationDetail,
      ...(commit.sha ? { commitSha: commit.sha } : {}),
      resultSummary: composeJobResult({
        gitSummary: commit.summary,
        assistant,
        committed: commit.committed,
        verification,
        verificationDetail,
        fabricationNote: fabricationNote(audit),
      }),
      lastActivity: "Done",
      completedAt: new Date().toISOString(),
      ...auditSidecar(audit),
    },
    { immediate: true },
  );
}

/**
 * The agent stopped normally, checkout placement (ADR-0045 §2). No commit:
 * the edits stay uncommitted in the user's tree. The review is the diff
 * minus what was already dirty at dispatch.
 */
async function completeCheckoutRun(
  input: WorkerFinishInput,
  assistant: string,
  deps: WorkerFinishDeps,
): Promise<void> {
  const preExisting = input.preExistingChanges ?? [];

  await deps.patch({ lastActivity: "Running checks" });
  const checked = await verifyJobWork(input.cwd, {
    enabled: input.verify !== false,
  });
  // Checks ran against the live tree; say so when the user's own uncommitted
  // work was in it, so a failure is not misattributed to the job (§7).
  const verificationDetail =
    preExisting.length > 0 && checked.status !== "skipped"
      ? `${checked.detail} (your uncommitted changes were present)`.trim()
      : checked.detail;

  const review = await gitCheckoutReview(input.cwd, {
    preExisting,
    ...(input.branch ? { branch: input.branch } : {}),
  });

  const committedPaths = review.files.map((file) => file.path);
  const audit = await auditCitedPaths({
    text: assistant,
    worktreePath: input.cwd,
    committedPaths,
  });

  const changed = review.files.length > 0;
  const gitSummary = changed
    ? `${review.files.length} file(s) in your working tree, +${review.totalAdded} -${review.totalRemoved}, uncommitted`
    : "";
  await deps.logLine(
    "done",
    changed
      ? `Done — ${review.files.length} file(s) in your working tree, uncommitted`
      : "Done — no reviewable change",
  );
  await deps.patch(
    {
      phase: "done",
      gitSummary,
      review,
      verification: checked.status,
      verificationDetail,
      resultSummary: composeJobResult({
        gitSummary,
        assistant,
        committed: false,
        verification: checked.status,
        verificationDetail,
        fabricationNote: fabricationNote(audit),
      }),
      lastActivity: "Done",
      completedAt: new Date().toISOString(),
      ...auditSidecar(audit),
    },
    { immediate: true },
  );
}

export async function completeWorkerRun(
  input: WorkerFinishInput,
  assistant: string,
  deps: WorkerFinishDeps,
): Promise<void> {
  if (input.placement === "checkout") {
    return completeCheckoutRun(input, assistant, deps);
  }
  return completeWorktreeRun(input, assistant, deps);
}
