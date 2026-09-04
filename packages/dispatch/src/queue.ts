/**
 * The job queue drain loop (M-067 P-S1, ADR-0047).
 *
 * Before this file, `start_job` did everything inline: a disk stat, a full
 * `reapJobs` over every run sidecar, `git rev-parse`, `git worktree add`, a
 * sign-in that can take 180 seconds, and a worker spawn — all before the chat
 * got a reply. Two things were wrong with that. The obvious one is latency.
 * The subtler one is that every gate along the way returned a *message* and
 * created no job, so a refused dispatch left nothing behind: no row on the
 * board, no record that the user had asked for anything.
 *
 * Now `start_job` writes a `queued` record and returns. This module does the
 * rest, and every gate it hits becomes a visible state on that record rather
 * than a message that disappears with the chat turn.
 *
 * Two things drive the drain:
 *
 * 1. `kickDrain` — fire-and-forget from `start_job`, so a job starts moving
 *    immediately even when no hub daemon is running.
 * 2. The hub's existing 2s watch tick, which catches jobs orphaned by an MCP
 *    process that exited, and re-checks jobs parked behind the cap.
 *
 * Both call `drainWorkspace`, which is idempotent and guarded by an
 * in-process lock plus a compare-and-set claim (`claimQueuedJob`).
 */

import { loadConfig } from "./config.js";
import { defaultGitRunner, gitDirtyPaths } from "./git.js";
import {
  activeJobCount,
  claimQueuedJob,
  loadJobs,
  queuedJobs,
  upsertJob,
} from "./jobs.js";
import {
  agentNameForJob,
  dirtyCheckoutSpeak,
  overlapSpeak,
  publicWorkerError,
} from "./job-voice.js";
import { loadMemories } from "./memory.js";
import { findPathOverlap } from "./overlap.js";
import { isProcessAlive, reapJobs } from "./run-state.js";
import type { GitRunner } from "./git.js";
import type { JobConfirm, JobPlacement, JobRecord } from "./types.js";
import { diskBudgetMessage } from "./worker-budget.js";
import { resolveMcpLaunch, workerPrompt, type WorkerPort } from "./worker.js";
import { adoptOrCreateWorktree } from "./worktrees.js";
import { linkWorktreeInstall } from "./worktree-install.js";
import type { WorkerBackend } from "./worker-backend.js";

/**
 * Everything the drain needs from the runtime, passed in rather than imported,
 * so tests can drive the loop without a real git repo or a real agent.
 */
export type DrainDeps = {
  readonly workspaceRoot: string;
  readonly git?: GitRunner;
  /** Resolve credentials for a backend. Slow: this is the 180s login. */
  readonly resolveAuth: (
    backend: WorkerBackend,
  ) => Promise<{ ready: boolean; message: string; apiKey?: string }>;
  readonly workerFor: (backend: WorkerBackend) => WorkerPort | undefined;
  readonly baseRef: () => Promise<string>;
  readonly env: NodeJS.ProcessEnv;
  /**
   * Machine-wide admission gates, owned by the runtime rather than recomputed
   * here. They read live free memory, which under vitest would make the suite
   * depend on whatever else the host is running — the runtime holds the
   * override that keeps that out of the tests.
   */
  readonly ramGate: () => string | undefined;
  readonly admissionGate: (
    activeCount: number,
    maxJobs: number,
  ) => string | undefined;
};

/** Why a queued job did not start on this pass. */
type DrainOutcome =
  | { kind: "started"; job: JobRecord }
  | { kind: "gated"; job: JobRecord; reason: string }
  | { kind: "deferred"; reason: string };

const inFlight = new Map<string, Promise<void>>();

/**
 * Run the drain for one workspace, coalescing concurrent callers.
 *
 * If a drain is already running for this workspace, the caller waits for it
 * rather than starting a second one. That keeps the hub tick and the
 * `start_job` kick from racing inside a single process; `claimQueuedJob`
 * handles the cross-process case.
 */
export async function drainWorkspace(deps: DrainDeps): Promise<void> {
  const existing = inFlight.get(deps.workspaceRoot);
  if (existing) return await existing;
  const run = drainOnce(deps).finally(() => {
    inFlight.delete(deps.workspaceRoot);
  });
  inFlight.set(deps.workspaceRoot, run);
  return await run;
}

/** Start a drain without waiting for it. Errors are recorded on the job, never thrown at the caller. */
export function kickDrain(deps: DrainDeps): void {
  void drainWorkspace(deps).catch(() => {
    /* a failed drain leaves jobs queued; the next tick retries */
  });
}

/**
 * Wait for every in-flight drain to finish.
 *
 * `kickDrain` deliberately outlives the call that started it — that is what
 * lets `start_job` return in under 500ms. Anything that tears down the
 * workspace underneath a drain (a test fixture, a daemon shutting down) has to
 * wait for it first, or it races a half-finished write.
 */
export async function settleDrains(): Promise<void> {
  while (inFlight.size > 0) {
    await Promise.allSettled(inFlight.values());
  }
}

async function drainOnce(deps: DrainDeps): Promise<void> {
  const config = await loadConfig(deps.workspaceRoot);
  // Reconcile with run sidecars first so the cap counts reality, not a stale
  // `running` row whose pid died an hour ago.
  const jobs = await reapJobs(deps.workspaceRoot);
  const waiting = queuedJobs(jobs);
  if (waiting.length === 0) return;

  let active = activeJobCount(jobs);
  for (const queued of waiting) {
    const outcome = await advanceJob(deps, queued, {
      activeCount: active,
      maxJobs: config.maxJobs,
      subagents: config.subagents,
      verify: config.verifyJobs,
      placement: config.placement,
      jobInstructions: config.jobInstructions,
    });
    if (outcome.kind === "started") {
      active += 1;
      continue;
    }
    if (outcome.kind === "deferred") {
      // Resource or cap pressure applies to every remaining job, so stop
      // rather than hammering the same gate once per queued row.
      break;
    }
  }
}

type DrainConfig = {
  readonly activeCount: number;
  readonly maxJobs: number;
  readonly subagents: boolean;
  readonly verify: boolean;
  readonly placement: JobPlacement;
  readonly jobInstructions: string;
};

/**
 * Take one queued job as far as it can go.
 *
 * Order matters: cheap machine-wide gates first (they defer the whole queue),
 * then per-job gates that need a human (they park this job and let the next
 * one through), then the expensive auth and spawn.
 */
async function advanceJob(
  deps: DrainDeps,
  job: JobRecord,
  config: DrainConfig,
): Promise<DrainOutcome> {
  const ram = deps.ramGate();
  if (ram) return await defer(deps, job, ram);

  const disk = await diskBudgetMessage(deps.workspaceRoot);
  if (disk) return await defer(deps, job, disk);

  const admission = deps.admissionGate(config.activeCount, config.maxJobs);
  if (admission) return await defer(deps, job, admission);

  // Placement and the worktree. A job enqueued with an empty `worktreePath`
  // has not been placed yet; a re-queued job keeps the placement it had.
  let placed: JobRecord;
  try {
    placed = await placeJob(deps, job, config);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      kind: "gated",
      job: await upsertJob(deps.workspaceRoot, {
        ...job,
        status: "blocked",
        waitingOn: "git",
        nextStep: detail,
      }),
      reason: detail,
    };
  }
  if (placed.status === "needs_confirm") {
    return { kind: "gated", job: placed, reason: "needs a confirmation" };
  }

  const auth = await deps.resolveAuth(placed.workerBackend ?? "cursor");
  if (!auth.ready) {
    return {
      kind: "gated",
      job: await upsertJob(deps.workspaceRoot, {
        ...placed,
        status: "blocked",
        waitingOn: "worker-auth",
        nextStep: auth.message,
      }),
      reason: auth.message,
    };
  }

  const worker = deps.workerFor(placed.workerBackend ?? "cursor");
  if (!worker) {
    return {
      kind: "gated",
      job: await upsertJob(deps.workspaceRoot, {
        ...placed,
        status: "blocked",
        waitingOn: "worker",
        nextStep:
          "No teammate is configured. Reload the prism MCP server, then say prism init.",
      }),
      reason: "no worker",
    };
  }

  // Claim last, immediately before the spawn, so a job parked on a gate stays
  // visibly queued rather than sitting in `booting` forever.
  const claimed = await claimQueuedJob(deps.workspaceRoot, placed.id);
  if (!claimed)
    return { kind: "gated", job: placed, reason: "claimed elsewhere" };

  return await spawnWorker(
    deps,
    { ...claimed, ...placed, status: "booting" },
    worker,
    auth,
    config,
  );
}

async function defer(
  deps: DrainDeps,
  job: JobRecord,
  reason: string,
): Promise<DrainOutcome> {
  // Stay `queued` — the job is still going to run, it is just waiting for the
  // machine. Recording the reason means the board can say why.
  if (job.nextStep !== reason) {
    await upsertJob(deps.workspaceRoot, { ...job, nextStep: reason });
  }
  return { kind: "deferred", reason };
}

/**
 * Decide where the job works and make that place exist.
 *
 * Returns a `needs_confirm` job when a gate needs a human. Before M-067 both
 * of these returned a bare message and no job at all.
 */
async function placeJob(
  deps: DrainDeps,
  job: JobRecord,
  config: DrainConfig,
): Promise<JobRecord> {
  const jobs = await loadJobs(deps.workspaceRoot);
  const requested = job.placement ?? config.placement;

  let placement: JobPlacement = requested;
  let placementNote = "";
  if (placement === "checkout") {
    const checkoutBusy = jobs.some(
      (other) =>
        other.placement === "checkout" &&
        other.id !== job.id &&
        (other.status === "running" ||
          other.status === "booting" ||
          other.status === "ready") &&
        isProcessAlive(other.workerPid),
    );
    if (checkoutBusy) {
      placement = "worktree";
      placementNote =
        "Your checkout already had a teammate in it, so this one took its own branch.";
    }
  }

  const git = deps.git ?? defaultGitRunner;
  let tree: {
    path: string;
    branch: string;
    source: JobRecord["source"];
    cursorAgentId?: string;
    claudeSession?: string;
  };
  let preExistingChanges: string[] = [];

  if (placement === "checkout") {
    const [branchRow, dirty] = await Promise.all([
      git(deps.workspaceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
      gitDirtyPaths(deps.workspaceRoot, deps.git),
    ]);
    if (!branchRow.ok) throw new Error(branchRow.stderr.trim() || "git failed");

    if (dirty.length > 0 && !hasGrant(job, "confirmDirty")) {
      return await parkForConfirm(deps, job, {
        kind: "dirty-checkout",
        arg: "confirmDirty",
        question: dirtyCheckoutSpeak(dirty.length),
        dirtyPaths: dirty,
      });
    }
    tree = {
      path: deps.workspaceRoot,
      branch: branchRow.stdout.trim() || "HEAD",
      source: "checkout",
    };
    preExistingChanges = dirty;
  } else if (job.worktreePath && job.branch) {
    tree = {
      path: job.worktreePath,
      branch: job.branch,
      source: job.source,
      ...(job.cursorAgentId ? { cursorAgentId: job.cursorAgentId } : {}),
      ...(job.claudeSession ? { claudeSession: job.claudeSession } : {}),
    };
  } else {
    tree = await adoptOrCreateWorktree({
      workspaceRoot: deps.workspaceRoot,
      jobId: job.id,
      title: job.title,
      ...(job.branch ? { preferredBranch: job.branch } : {}),
      ...(deps.git ? { run: deps.git } : {}),
    });
  }

  if (tree.source === "prism") {
    await linkWorktreeInstall({
      workspaceRoot: deps.workspaceRoot,
      worktreePath: tree.path,
    });
  }

  const overlap = await findPathOverlap({
    jobs,
    path: tree.path,
    ignoreJobId: job.id,
    ...(deps.git ? { git: deps.git } : {}),
  });
  if (overlap && !hasGrant(job, "confirmOverlap")) {
    return await parkForConfirm(deps, job, {
      kind: "path-overlap",
      arg: "confirmOverlap",
      question: overlapSpeak({
        title: overlap.existingTitle,
        dirty: overlap.dirty,
      }),
      dirtyPaths: [],
      overlapJobId: overlap.existingJobId,
      overlapTitle: overlap.existingTitle,
    });
  }

  return await upsertJob(deps.workspaceRoot, {
    ...job,
    branch: tree.branch,
    worktreePath: tree.path,
    source: tree.source,
    placement,
    ...(placementNote ? { lastStep: placementNote } : {}),
    ...(tree.cursorAgentId ? { cursorAgentId: tree.cursorAgentId } : {}),
    ...(tree.claudeSession ? { claudeSession: tree.claudeSession } : {}),
    ...(placement === "checkout" && preExistingChanges.length > 0
      ? { preExistingChanges }
      : {}),
  });
}

/** Has the user already answered this gate for this job? */
function hasGrant(job: JobRecord, arg: JobConfirm["arg"]): boolean {
  return (job.confirmed ?? []).includes(arg);
}

async function parkForConfirm(
  deps: DrainDeps,
  job: JobRecord,
  confirm: JobConfirm,
): Promise<JobRecord> {
  return await upsertJob(deps.workspaceRoot, {
    ...job,
    status: "needs_confirm",
    waitingOn: "you",
    nextStep: confirm.question,
    confirm,
  });
}

async function spawnWorker(
  deps: DrainDeps,
  job: JobRecord,
  worker: WorkerPort,
  auth: { apiKey?: string },
  config: DrainConfig,
): Promise<DrainOutcome> {
  const memories = await loadMemories(deps.workspaceRoot);
  const launch = resolveMcpLaunch(deps.env);
  try {
    const started = await worker.start({
      jobId: job.id,
      cwd: job.worktreePath,
      name: agentNameForJob(job),
      ...(auth.apiKey ? { apiKey: auth.apiKey } : {}),
      prompt: workerPrompt({
        job,
        memories,
        subagents: config.subagents,
        placement: job.placement ?? "checkout",
        jobInstructions: config.jobInstructions,
      }),
      mcpCommand: launch.command,
      mcpArgs: launch.args,
      workspaceRoot: deps.workspaceRoot,
      title: job.title,
      baseRef: await deps.baseRef(),
      subagents: config.subagents,
      verify: config.verify,
      placement: job.placement ?? "checkout",
      ...(job.preExistingChanges
        ? { preExistingChanges: job.preExistingChanges }
        : {}),
    });
    const running = await upsertJob(deps.workspaceRoot, {
      ...job,
      status: "running",
      // The one honest moment to start the work clock: a process now exists.
      startedAt: new Date().toISOString(),
      lastActivity: "Starting",
      errorMessage: undefined,
      resultSummary: undefined,
      nextStep: "",
      waitingOn: "",
      ...(started.agentId ? { cursorAgentId: started.agentId } : {}),
      ...(typeof started.pid === "number" ? { workerPid: started.pid } : {}),
    });
    return { kind: "started", job: running };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      kind: "gated",
      job: await upsertJob(deps.workspaceRoot, {
        ...job,
        status: "blocked",
        waitingOn: "worker",
        nextStep: publicWorkerError(detail),
      }),
      reason: detail,
    };
  }
}

/**
 * Put every job blocked on sign-in back in the queue.
 *
 * Called after `init` succeeds. Before M-067 the user had to say "resume" for
 * each one by hand, which is a chore the machine can do.
 */
export async function requeueAuthBlocked(
  workspaceRoot: string,
): Promise<JobRecord[]> {
  const jobs = await loadJobs(workspaceRoot);
  const blocked = jobs.filter(
    (job) => job.status === "blocked" && job.waitingOn === "worker-auth",
  );
  const requeued: JobRecord[] = [];
  for (const job of blocked) {
    requeued.push(
      await upsertJob(workspaceRoot, {
        ...job,
        status: "queued",
        queuedAt: new Date().toISOString(),
        waitingOn: "",
        nextStep: "",
      }),
    );
  }
  return requeued;
}
