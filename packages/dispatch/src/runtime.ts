import { randomUUID } from "node:crypto";
import { buildDayBriefing, type BriefingDeps } from "./briefing.js";
import { grantPurpose, isPurposeGranted, revokePurpose } from "./consent.js";
import {
  loadConfig,
  saveConfig,
  SHARED_DISPATCH_CONFIG_SPEAK,
} from "./config.js";
import { DRIVER_LABELS } from "./drivers.js";
import { exportSettings } from "./export-settings.js";
import {
  commitJobPaths,
  defaultBaseBranch,
  defaultGitRunner,
  gitDirtyPaths,
  gitSnapshot,
  gitStatusShort,
  unexpectedDirtyPaths,
  unionPaths,
  type GitRunner,
} from "./git.js";
import { allocateJobId, displayJobId, resolveJobRef } from "./job-id.js";
import {
  agentNameForJob,
  alreadyRunningSpeak,
  ambiguousJobSpeak,
  controlSpeak,
  dirtyCheckoutSpeak,
  dirtyResumeSpeak,
  doctorSpeak,
  gitFailureSpeak,
  initSpeak,
  isLiveJobStatus,
  jobLogsSpeak,
  jobRef,
  listJobsSpeak,
  missingJobSpeak,
  overlapSpeak,
  publicWorkerError,
  recordedJobSpeak,
  signedInSpeak,
  startJobSpeak,
} from "./job-voice.js";
import { activeJobCount, upsertJob } from "./jobs.js";
import { readRunLog } from "./run-log.js";
import { isProcessAlive, killWorkerTreeForce, reapJobs } from "./run-state.js";
import { continueWorkerRun, pauseWorkerRun } from "./worker-spawn.js";
import { forgetMemory, loadMemories, remember } from "./memory.js";
import {
  authBrokerUrl,
  brokerStartUrl,
  listBrokerDrivers,
  redeemBrokerPickup,
} from "./broker.js";
import {
  buildAuthorizeUrl,
  createPkce,
  DISPATCH_OAUTH_LOOPBACK_PORT,
  DISPATCH_OAUTH_REDIRECT_URI,
  exchangeCode,
  oauthSetupGuide,
  OAUTH_PROVIDERS,
  openInBrowser,
  resolveOAuthClient,
  waitForLoopbackCode,
  type LoopbackResult,
} from "./oauth.js";
import { saveOAuthApp } from "./oauth-apps.js";
import {
  connectPlan,
  markConnectStep,
  presentationHint,
  silentAuthSession,
  skipConnectStep,
  type AuthPresentation,
  type ConnectStep,
  type OAuthUiPort,
} from "./connect-ux.js";
import { findPathOverlap } from "./overlap.js";
import { deleteToken, loadToken, saveToken } from "./tokens.js";
import {
  DRIVER_CONSENT,
  DispatchConfigSchema,
  DriverIdSchema,
  parseDriverId,
  type DispatchConfig,
  type DriverId,
  type JobPlacement,
  type JobRecord,
  type MemoryScope,
} from "./types.js";
import {
  loadCursorSdk,
  resolveMcpLaunch,
  workerPrompt,
  type WorkerPort,
} from "./worker.js";
import {
  createSdkCursorAuthPort,
  ensureCursorWorkerAuth,
  inspectCursorWorkerAuth,
  type CursorAuthPort,
} from "./cursor-auth.js";
import {
  createClaudeAuthPort,
  ensureClaudeWorkerAuth,
  type ClaudeAuthPort,
} from "./claude-auth.js";
import {
  resolveWorkerBackend,
  workerBackendLabel,
  type WorkerAuthInspect,
  type WorkerBackend,
} from "./worker-backend.js";
import { adoptOrCreateWorktree, pruneOrphanWorktrees } from "./worktrees.js";
import {
  admissionMessage,
  diskBudgetMessage,
  ramBudgetMessage,
} from "./worker-budget.js";
import { linkWorktreeInstall } from "./worktree-install.js";

export const DISPATCH_TOOL_NAMES = [
  "start_my_day",
  "init",
  "start_job",
  "list_jobs",
  "job_logs",
  "job_control",
  "remember",
  "integrations",
  "configure",
  "dispatch_doctor",
] as const;

export type DispatchToolName = (typeof DISPATCH_TOOL_NAMES)[number];

export const WORKER_HIDDEN_TOOLS: readonly DispatchToolName[] = [
  "start_my_day",
  "init",
  "start_job",
];

export function isWorkerRole(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PRISM_DISPATCH_ROLE === "worker";
}

export function visibleDispatchTools(
  env: NodeJS.ProcessEnv = process.env,
): readonly DispatchToolName[] {
  if (!isWorkerRole(env)) return DISPATCH_TOOL_NAMES;
  return DISPATCH_TOOL_NAMES.filter(
    (name) => !WORKER_HIDDEN_TOOLS.includes(name),
  );
}

export type DispatchToolContext = {
  readonly oauthUi?: OAuthUiPort;
  readonly signal?: AbortSignal;
};

export type DispatchRuntime = {
  readonly workspaceRoot: string;
  handle(
    name: DispatchToolName,
    args: Record<string, unknown>,
    context?: DispatchToolContext,
  ): Promise<unknown>;
};

export type DispatchRuntimeOptions = BriefingDeps & {
  readonly worker?: WorkerPort;
  /** Claude Code backend (ADR-0044). Chosen per job by resolveWorkerBackend. */
  readonly claudeWorker?: WorkerPort;
  readonly startOAuth?: (driver: DriverId) => Promise<unknown>;
  readonly fetchImpl?: typeof fetch;
  readonly oauthUi?: OAuthUiPort;
  /** Injected in tests. Production uses Cursor.auth (SDK store), not mcp.json. */
  readonly cursorAuth?: CursorAuthPort;
  /** Injected in tests. Production probes the claude CLI + credentials. */
  readonly claudeAuth?: ClaudeAuthPort;
  /** Injected in tests. Production reads MCP clientInfo after initialize. */
  readonly getClientName?: () => string | undefined;
  /** Injected in tests. Skips config/env/client resolution entirely. */
  readonly workerBackend?: WorkerBackend;
  /** Injected in tests. Production reads `os.freemem()`. */
  readonly freeMemoryBytes?: number;
  /**
   * Live workspace when the MCP client later reports roots. Each tool call
   * reads this so Dispatch does not stay stuck on the process cwd.
   */
  readonly getWorkspaceRoot?: () => string;
};

function ramGate(options: DispatchRuntimeOptions): string | undefined {
  if (options.freeMemoryBytes == null && process.env.VITEST) return undefined;
  return ramBudgetMessage(options.freeMemoryBytes);
}

/**
 * Live free memory decides admission, except under vitest where an
 * uninjected reading would make the suite depend on the host machine. The
 * explicit `maxJobs` cap is still enforced there.
 */
function admissionGate(
  options: DispatchRuntimeOptions,
  activeCount: number,
  maxJobs: number,
): string | undefined {
  const freeBytes =
    options.freeMemoryBytes ??
    (process.env.VITEST ? Number.POSITIVE_INFINITY : undefined);
  return admissionMessage({
    activeCount,
    maxJobs,
    ...(freeBytes == null ? {} : { freeBytes }),
  });
}

export function createDispatchRuntime(
  input: DispatchRuntimeOptions,
): DispatchRuntime {
  const getRoot = input.getWorkspaceRoot ?? (() => input.workspaceRoot);
  const options: DispatchRuntimeOptions = {
    ...input,
    get workspaceRoot() {
      return getRoot();
    },
  };
  const env = options.env ?? process.env;
  return {
    get workspaceRoot() {
      return getRoot();
    },
    async handle(name, args, context) {
      if (
        isWorkerRole(env) &&
        (name === "start_my_day" || name === "start_job" || name === "init")
      ) {
        return {
          message:
            "This Prism process is a Dispatch worker. It cannot start jobs or standups.",
        };
      }
      switch (name) {
        case "start_my_day":
          await reapJobs(options.workspaceRoot);
          return buildDayBriefing({
            ...options,
            ...((options.brokerFetch ?? options.fetchImpl)
              ? {
                  brokerFetch: options.brokerFetch ?? options.fetchImpl,
                }
              : {}),
          });
        case "init":
          return initTool(options, env, context);
        case "start_job":
          return startJob(options, args, env, context);
        case "list_jobs":
          return listJobs(options);
        case "job_logs":
          return jobLogs(options, args);
        case "job_control":
          return jobControl(options, args, env, context);
        case "remember":
          return rememberTool(options.workspaceRoot, args);
        case "integrations":
          return integrationsTool(options, args, env, context);
        case "configure":
          return configureTool(options.workspaceRoot, args);
        case "dispatch_doctor":
          return doctorTool(options, env);
      }
    },
  };
}

async function defaultBaseRef(
  options: DispatchRuntimeOptions,
): Promise<string> {
  return defaultBaseBranch(
    options.workspaceRoot,
    ...(options.git ? ([options.git] as const) : ([] as const)),
  );
}

function jobIdFrom(
  title: string,
  taken: ReadonlySet<string>,
  explicit?: unknown,
): string {
  return allocateJobId({
    title,
    taken,
    ...(typeof explicit === "string" ? { explicit } : {}),
  });
}

async function startJob(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
): Promise<unknown> {
  const title = String(args.title ?? args.ticket ?? "").trim();
  const prd = String(args.prd ?? args.brief ?? "").trim();
  if (!title) {
    return { message: "start_job needs a title (and a PRD helps)." };
  }
  const ram = ramGate(options);
  if (ram) return { message: ram };
  const disk = await diskBudgetMessage(options.workspaceRoot);
  if (disk) return { message: disk };
  const config = await loadConfig(options.workspaceRoot);
  const backend =
    options.workerBackend ??
    resolveWorkerBackend({
      config,
      env,
      clientName: options.getClientName?.(),
    });
  const jobs = await reapJobs(options.workspaceRoot);
  const id = jobIdFrom(
    title,
    new Set(jobs.map((job) => job.id)),
    args.jobId ?? args.id,
  );
  const existing = jobs.find((job) => job.id === id);
  if (
    existing &&
    isProcessAlive(existing.workerPid) &&
    (existing.status === "running" ||
      existing.status === "booting" ||
      existing.status === "paused")
  ) {
    if (existing.status === "paused") {
      return {
        job: existing,
        message: `${jobRef(existing)} is paused — say resume to continue.`,
      };
    }
    return {
      job: existing,
      message: alreadyRunningSpeak(existing),
    };
  }
  const admission = admissionGate(
    options,
    activeJobCount(jobs),
    config.maxJobs,
  );
  if (admission) {
    return { message: admission, maxJobs: config.maxJobs };
  }

  // Placement (ADR-0045): the checkout by default; a worktree only when the
  // user asks for isolation or the checkout already has a live teammate.
  const isolationIntent =
    args.placement === "worktree" || typeof args.branch === "string";
  let placement: JobPlacement =
    existing?.placement ?? (isolationIntent ? "worktree" : config.placement);
  let placementNote = "";
  if (placement === "checkout" && !existing) {
    const checkoutBusy = jobs.some(
      (job) =>
        job.placement === "checkout" &&
        job.id !== id &&
        (job.status === "running" ||
          job.status === "booting" ||
          job.status === "ready" ||
          job.status === "paused") &&
        isProcessAlive(job.workerPid),
    );
    if (checkoutBusy) {
      placement = "worktree";
      placementNote =
        "Your checkout already has a teammate in it, so this one took its own branch.";
    }
  }

  let tree: {
    path: string;
    branch: string;
    source: JobRecord["source"];
    cursorAgentId?: string;
    claudeSession?: string;
  };
  let preExistingChanges: string[] = [];
  try {
    if (placement === "checkout" && !existing) {
      const [branchRow, dirty] = await Promise.all([
        (options.git ?? defaultGitRunner)(options.workspaceRoot, [
          "rev-parse",
          "--abbrev-ref",
          "HEAD",
        ]),
        gitDirtyPaths(options.workspaceRoot, options.git),
      ]);
      if (!branchRow.ok) {
        return { message: gitFailureSpeak(branchRow.stderr.trim()) };
      }
      // Dirty tree asks first (ADR-0045 §4): the teammate works alongside
      // whatever the user has in flight, and the finish review subtracts it.
      if (dirty.length > 0 && args.confirmDirty !== true) {
        return {
          needsConfirm: true,
          dirtyPaths: dirty,
          message: dirtyCheckoutSpeak(dirty.length),
        };
      }
      const branch = branchRow.stdout.trim() || "HEAD";
      tree = {
        path: options.workspaceRoot,
        branch,
        source: "checkout",
      };
      preExistingChanges = dirty;
    } else {
      tree = existing
        ? {
            path: existing.worktreePath,
            branch: existing.branch,
            source: existing.source,
            ...(existing.cursorAgentId
              ? { cursorAgentId: existing.cursorAgentId }
              : {}),
            ...(existing.claudeSession
              ? { claudeSession: existing.claudeSession }
              : {}),
          }
        : await adoptOrCreateWorktree({
            workspaceRoot: options.workspaceRoot,
            jobId: id,
            title,
            ...(typeof args.branch === "string"
              ? { preferredBranch: args.branch }
              : {}),
            ...(options.git ? { run: options.git } : {}),
          });
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { message: gitFailureSpeak(detail) };
  }

  if (tree.source === "prism") {
    await linkWorktreeInstall({
      workspaceRoot: options.workspaceRoot,
      worktreePath: tree.path,
    });
  }

  const overlap = await findPathOverlap({
    jobs,
    path: tree.path,
    ignoreJobId: id,
    ...(options.git ? { git: options.git } : {}),
  });
  if (overlap && args.confirmOverlap !== true) {
    return {
      needsConfirm: true,
      overlap,
      message: overlapSpeak({
        title: overlap.existingTitle,
        dirty: overlap.dirty,
      }),
    };
  }

  const now = new Date().toISOString();
  let job: JobRecord = {
    id,
    title,
    playbook: String(args.playbook ?? "ticket"),
    prd,
    branch: tree.branch,
    worktreePath: tree.path,
    source: tree.source,
    status: "ready",
    lastStep: "",
    nextStep: "agent booting",
    waitingOn: "",
    workerBackend: backend,
    placement,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(tree.cursorAgentId ? { cursorAgentId: tree.cursorAgentId } : {}),
    ...(tree.claudeSession ? { claudeSession: tree.claudeSession } : {}),
    ...(placement === "checkout" && preExistingChanges.length > 0
      ? { preExistingChanges }
      : {}),
  };
  job = await upsertJob(options.workspaceRoot, job);

  const creds = await resolveWorkerAuth(options, env, context, {
    login: true,
    backend,
  });
  if (!creds.ready) {
    job = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "blocked",
      waitingOn: "worker-auth",
      nextStep: creds.message,
    });
    return {
      job,
      message: recordedJobSpeak(
        job,
        `sign-in is still needed. ${creds.message} Then say “resume ${displayJobId(job)}”.`,
      ),
    };
  }

  const memories = await loadMemories(options.workspaceRoot);
  const launch = resolveMcpLaunch(env);
  const worker = workerForBackend(options, backend);
  if (!worker) {
    return {
      job,
      message: recordedJobSpeak(
        job,
        "no teammate is configured. Reload the prism MCP server, then say prism init.",
      ),
    };
  }

  job = await upsertJob(options.workspaceRoot, {
    ...job,
    status: "booting",
  });
  try {
    const started = await worker.start({
      jobId: job.id,
      cwd: job.worktreePath,
      name: agentNameForJob(job),
      ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
      prompt: workerPrompt({
        job,
        memories,
        subagents: config.subagents,
        placement,
      }),
      mcpCommand: launch.command,
      mcpArgs: launch.args,
      workspaceRoot: options.workspaceRoot,
      title: job.title,
      baseRef: await defaultBaseRef(options),
      subagents: config.subagents,
      verify: config.verifyJobs,
      placement,
      ...(job.preExistingChanges
        ? { preExistingChanges: job.preExistingChanges }
        : {}),
    });
    job = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "running",
      lastActivity: "Starting",
      errorMessage: undefined,
      resultSummary: undefined,
      nextStep: "",
      ...(started.agentId ? { cursorAgentId: started.agentId } : {}),
      ...(typeof started.pid === "number" ? { workerPid: started.pid } : {}),
    });
    return {
      job,
      message: [startJobSpeak(job), placementNote].filter(Boolean).join(" "),
    };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    job = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "blocked",
      waitingOn: "worker",
      nextStep: "",
    });
    return {
      job,
      message: recordedJobSpeak(job, publicWorkerError(detail)),
    };
  }
}

/**
 * The console behind a job: recent log lines plus the uncommitted review.
 *
 * `since` makes this pollable — the Jobs console and chat both tail forward
 * rather than re-reading the whole file.
 */
async function jobLogs(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const jobs = await reapJobs(options.workspaceRoot);
  const ref = String(args.jobId ?? args.id ?? args.job ?? "").trim();

  let job: JobRecord | undefined;
  if (ref) {
    const resolved = resolveJobRef(jobs, ref);
    if (resolved?.kind === "many") {
      return { message: ambiguousJobSpeak(resolved.jobs) };
    }
    job = resolved?.job;
    if (!job) return { message: missingJobSpeak(ref, jobs) };
  } else {
    // No id: the console the user means is the one still running, else the
    // most recent job.
    job = jobs.find((row) => isLiveJobStatus(row.status)) ?? jobs.at(-1);
    if (!job) {
      return {
        message: "No jobs yet. Ask me to change something and I'll start one.",
      };
    }
  }

  const page = await readRunLog(options.workspaceRoot, job.id, {
    ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
    ...(typeof args.since === "string" ? { since: args.since } : {}),
  });

  return {
    jobId: job.id,
    title: job.title,
    status: job.status,
    entries: page.entries,
    totalCount: page.totalCount,
    truncated: page.truncated,
    ...(job.review ? { review: job.review } : {}),
    message: jobLogsSpeak(job, page.entries, job.review),
  };
}

async function listJobs(options: DispatchRuntimeOptions): Promise<unknown> {
  const jobs = await reapJobs(options.workspaceRoot);
  // Reap is the natural place to notice trees whose job record is gone.
  // Best-effort: a GC failure must never break "where are we".
  try {
    await pruneOrphanWorktrees({
      workspaceRoot: options.workspaceRoot,
      liveJobIds: new Set(jobs.map((job) => job.id)),
      baseRef: await defaultBaseRef(options),
      ...(options.git ? { run: options.git } : {}),
    });
  } catch {
    /* ignore */
  }
  const rows = [];
  for (const job of jobs) {
    const git = await gitStatusShort(job.worktreePath, options.git);
    rows.push({
      id: job.id,
      title: job.title,
      status: job.status,
      gitStatus: git || "clean",
      agentStatus: job.status,
      ...(job.lastActivity ? { lastActivity: job.lastActivity } : {}),
      ...(job.resultSummary ? { resultSummary: job.resultSummary } : {}),
      ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
      ...(job.review ? { review: job.review } : {}),
      ...(job.verification ? { verification: job.verification } : {}),
      ...(job.commitSha ? { commitSha: job.commitSha } : {}),
    });
  }
  return {
    jobs: rows,
    message: listJobsSpeak(rows),
  };
}

async function confirmCheckoutResume(
  options: DispatchRuntimeOptions,
  job: JobRecord,
  args: Record<string, unknown>,
): Promise<{ job: JobRecord; blocked?: Record<string, unknown> }> {
  if ((job.placement ?? "worktree") !== "checkout") {
    return { job };
  }
  const dirty = await gitDirtyPaths(job.worktreePath, options.git);
  const unexpected = unexpectedDirtyPaths(job, dirty);
  if (unexpected.length === 0) return { job };
  if (args.confirmDirty !== true) {
    return {
      job,
      blocked: {
        needsConfirm: true,
        dirtyPaths: unexpected,
        message: dirtyResumeSpeak(unexpected.length),
        job,
      },
    };
  }
  const next = await upsertJob(options.workspaceRoot, {
    ...job,
    preExistingChanges: unionPaths(job.preExistingChanges, unexpected),
    knownDirtyPaths: unionPaths(job.knownDirtyPaths, dirty),
  });
  return { job: next };
}

async function jobControl(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
): Promise<unknown> {
  const id = String(args.jobId ?? args.id ?? "").trim();
  const action = String(args.action ?? "").trim();
  const jobs = await reapJobs(options.workspaceRoot);
  const resolved = resolveJobRef(jobs, id);
  if (!resolved) {
    return { message: missingJobSpeak(id || "that job", jobs) };
  }
  if (resolved.kind === "many") {
    return { message: ambiguousJobSpeak(resolved.jobs) };
  }
  const job = resolved.job;
  const launch = resolveMcpLaunch(env);

  if (action === "pause") {
    const dirty =
      (job.placement ?? "worktree") === "checkout"
        ? await gitDirtyPaths(job.worktreePath, options.git)
        : [];
    const paused = await pauseWorkerRun({
      ...(typeof job.workerPid === "number" ? { pid: job.workerPid } : {}),
      workspaceRoot: options.workspaceRoot,
      jobId: job.id,
    });
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "paused",
      lastActivity: "Paused",
      nextStep: "paused — say resume to continue",
      ...(dirty.length > 0
        ? { knownDirtyPaths: unionPaths(job.knownDirtyPaths, dirty) }
        : {}),
    });
    return {
      job: next,
      message: controlSpeak("pause", next, paused.mode),
    };
  }

  if (action === "cancel") {
    const cancelWorker =
      workerForBackend(options, job.workerBackend ?? "cursor") ??
      options.worker ??
      options.claudeWorker;
    if (cancelWorker) {
      await cancelWorker.cancel({
        ...(job.cursorAgentId ? { agentId: job.cursorAgentId } : {}),
        cwd: job.worktreePath,
        jobId: job.id,
        workspaceRoot: options.workspaceRoot,
        ...(typeof job.workerPid === "number" ? { pid: job.workerPid } : {}),
      });
    }
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "cancelled",
      lastActivity: "Cancelled",
      nextStep: "",
    });
    return {
      job: next,
      message: controlSpeak("cancel", next),
    };
  }

  if (action === "resume" || action === "attach_context") {
    const extra = String(args.context ?? args.text ?? "").trim();
    let live = isProcessAlive(job.workerPid);
    if (live && job.status === "paused" && action === "resume" && extra) {
      // A frozen child is blocked on wait() — extra brief text cannot join
      // it. SIGKILL works on a SIGSTOP'd process; SIGTERM does not fire
      // until SIGCONT. Tear it down and spawn with the new context.
      if (typeof job.workerPid === "number") {
        killWorkerTreeForce(job.workerPid);
      }
      live = false;
    }
    if (live && job.status === "paused" && action === "resume") {
      const guard = await confirmCheckoutResume(options, job, args);
      if (guard.blocked) return guard.blocked;
      await continueWorkerRun({
        ...(typeof guard.job.workerPid === "number"
          ? { pid: guard.job.workerPid }
          : {}),
        workspaceRoot: options.workspaceRoot,
        jobId: guard.job.id,
      });
      const next = await upsertJob(options.workspaceRoot, {
        ...guard.job,
        status: "running",
        lastActivity: "Resumed",
        errorMessage: undefined,
        nextStep: "",
        waitingOn: "",
      });
      return { job: next, message: controlSpeak("resume", next) };
    }
    if (live) {
      if (action === "attach_context" && extra) {
        const next = await upsertJob(options.workspaceRoot, {
          ...job,
          pendingContext: [job.pendingContext, extra]
            .filter(Boolean)
            .join("\n\n"),
        });
        return {
          job: next,
          message: `Noted for ${jobRef(next)}. The teammate is still working — say “where are we” for live status.`,
        };
      }
      return { job, message: alreadyRunningSpeak(job) };
    }
    const guard = await confirmCheckoutResume(options, job, args);
    if (guard.blocked) return guard.blocked;
    const current = guard.job;
    const backend = current.workerBackend ?? "cursor";
    const creds = await resolveWorkerAuth(options, env, context, {
      login: true,
      backend,
    });
    if (!creds.ready) {
      return { message: creds.message, job: current };
    }
    const resumeWorker = workerForBackend(options, backend);
    if (!resumeWorker) {
      return { message: "No worker configured.", job: current };
    }
    const ram = ramGate(options);
    if (ram) return { message: ram, job: current };
    const disk = await diskBudgetMessage(options.workspaceRoot);
    if (disk) return { message: disk, job: current };
    if (current.source === "prism") {
      await linkWorktreeInstall({
        workspaceRoot: options.workspaceRoot,
        worktreePath: current.worktreePath,
      });
    }
    const memories = await loadMemories(options.workspaceRoot);
    const combinedExtra = [current.pendingContext, extra]
      .filter(Boolean)
      .join("\n\n");
    const jobPlacement = current.placement ?? "worktree";
    const placementFields = {
      placement: jobPlacement,
      ...(current.preExistingChanges
        ? { preExistingChanges: current.preExistingChanges }
        : {}),
    } as const;
    let pid: number | undefined;
    let agentId = current.cursorAgentId;
    // The resume handle is backend-specific: Cursor agentId, Claude session_id.
    const sessionHandle =
      backend === "claude" ? current.workerSessionId : current.cursorAgentId;
    if (sessionHandle) {
      const resumed = await resumeWorker.resume({
        jobId: current.id,
        agentId: sessionHandle,
        cwd: current.worktreePath,
        name: agentNameForJob(current),
        ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
        prompt:
          action === "attach_context"
            ? combinedExtra || "Continue."
            : workerPrompt({
                job: current,
                memories,
                extra: combinedExtra,
                placement: jobPlacement,
              }),
        mcpCommand: launch.command,
        mcpArgs: launch.args,
        workspaceRoot: options.workspaceRoot,
        ...placementFields,
      });
      if (resumed && typeof resumed.pid === "number") pid = resumed.pid;
    } else {
      const started = await resumeWorker.start({
        jobId: current.id,
        cwd: current.worktreePath,
        name: agentNameForJob(current),
        ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
        prompt: workerPrompt({
          job: current,
          memories,
          extra: combinedExtra,
          placement: jobPlacement,
        }),
        mcpCommand: launch.command,
        mcpArgs: launch.args,
        workspaceRoot: options.workspaceRoot,
        ...placementFields,
      });
      agentId = started.agentId ?? agentId;
      if (typeof started.pid === "number") pid = started.pid;
    }
    const next = await upsertJob(options.workspaceRoot, {
      ...current,
      status: "running",
      lastActivity: "Starting",
      errorMessage: undefined,
      pendingContext: undefined,
      nextStep: "",
      ...(agentId ? { cursorAgentId: agentId } : {}),
      ...(typeof pid === "number" ? { workerPid: pid } : {}),
    });
    return { job: next, message: controlSpeak("resume", next) };
  }

  if (action === "commit") {
    // Checkout jobs finish uncommitted (ADR-0045 §2); this is the explicit
    // "commit it". Only the job-touched set is staged — never the user's
    // unrelated uncommitted work.
    if ((job.placement ?? "worktree") !== "checkout") {
      return {
        message: `${jobRef(job)} is already committed on its own branch — review it there.`,
        job,
      };
    }
    const paths = (job.review?.files ?? []).map((file) => file.path);
    if (paths.length === 0) {
      return {
        message: `${jobRef(job)} has no file changes to commit.`,
        job,
      };
    }
    const commit = await commitJobPaths(
      options.workspaceRoot,
      { jobId: job.id, title: job.title, paths },
      ...(options.git ? ([options.git] as const) : ([] as const)),
    );
    if (!commit.committed) {
      return {
        message: `${jobRef(job)} — those files are no longer changed in your tree, so there is nothing to commit.`,
        job,
      };
    }
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "done",
      ...(commit.sha ? { commitSha: commit.sha } : {}),
      nextStep: "",
      waitingOn: "",
    });
    return {
      job: next,
      message: `Committed ${jobRef(next)} on your current branch — ${commit.summary || "its files"}${commit.sha ? ` (${commit.sha})` : ""}. Only the job's files were included; your other changes are untouched.`,
    };
  }

  return {
    message:
      "job_control action must be pause, resume, cancel, attach_context, or commit.",
    job,
  };
}

async function rememberTool(
  workspaceRoot: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const action = String(args.action ?? "add").trim();
  if (action === "list") {
    const items = await loadMemories(workspaceRoot);
    return {
      items,
      message:
        items.length === 0
          ? "No memories yet."
          : items
              .map((item) => `${item.id} (${item.scope}) ${item.text}`)
              .join("\n"),
    };
  }
  if (action === "forget") {
    const target = String(args.id ?? args.text ?? "").trim();
    const removed = await forgetMemory(workspaceRoot, target);
    return {
      removed,
      message: `Forgot ${removed} memor${removed === 1 ? "y" : "ies"}.`,
    };
  }
  const text = String(args.text ?? args.memory ?? "").trim();
  if (!text) return { message: "remember needs text." };
  if (args.confirm !== true && looksLikeCodeRule(text)) {
    return {
      needsConfirm: true,
      message:
        "That reads like a code-changing rule. Call remember again with confirm=true if you want Dispatch to inject it into the next job.",
      text,
    };
  }
  const item = await remember({
    workspaceRoot,
    text,
    scope: (String(args.scope ?? "repo") as MemoryScope) || "repo",
    ...(typeof args.jobId === "string" ? { jobId: args.jobId } : {}),
  });
  return { item, message: `Remembered (${item.scope}): ${item.text}` };
}

function looksLikeCodeRule(text: string): boolean {
  return /\b(always|never|must|rewrite|replace all|force push)\b/i.test(text);
}

async function integrationsTool(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
): Promise<unknown> {
  if (
    isWorkerRole(env) &&
    ["start", "connect", "callback"].includes(String(args.action))
  ) {
    return { message: "Workers cannot start OAuth." };
  }
  const action = String(args.action ?? "catalog").trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  if (action === "catalog" || action === "status") {
    const broker = authBrokerUrl(env);
    const brokerCatalog = await listBrokerDrivers(broker, fetchImpl);
    const rows = [];
    for (const id of DriverIdSchema.options) {
      const granted = await isPurposeGranted(
        options.workspaceRoot,
        DRIVER_CONSENT[id],
      );
      const token = await loadToken(options.workspaceRoot, id);
      const credentials = await resolveOAuthClient(
        options.workspaceRoot,
        OAUTH_PROVIDERS[id],
        env,
      );
      const brokerEnabled =
        brokerCatalog.drivers.find((row) => row.id === id)?.enabled === true;
      rows.push({
        id,
        label: DRIVER_LABELS[id],
        connected: Boolean(granted && token),
        brokerEnabled,
        connectReady: Boolean(credentials.clientId || brokerEnabled),
        consentPurpose: DRIVER_CONSENT[id],
      });
    }
    return {
      drivers: rows,
      broker,
      brokerReachable: brokerCatalog.reachable,
      redirectUri: DISPATCH_OAUTH_REDIRECT_URI,
      message: rows
        .map((row) => {
          if (row.connected) return `${row.label}: connected`;
          if (row.connectReady) {
            return `${row.label}: not connected — say “connect ${row.label}”`;
          }
          if (!brokerCatalog.reachable) {
            return `${row.label}: not connected (Prism Auth unreachable${brokerCatalog.reason ? ` — ${brokerCatalog.reason}` : ""})`;
          }
          return `${row.label}: not connected (Prism Auth has not enabled this connector yet)`;
        })
        .join("\n"),
    };
  }
  if (action === "setup") {
    const driver = parseDriverId(args.driver);
    if (!driver) {
      return {
        broker: authBrokerUrl(env),
        message:
          "Name a driver: github, linear, jira, slack, notion, google-calendar. Say “connect …” — Cursor shows Authenticate; Claude opens Prism Auth. You do not paste a client id.",
      };
    }
    return oauthSetupGuide(OAUTH_PROVIDERS[driver]);
  }
  if (action === "disconnect") {
    const driver = parseDriverId(args.driver);
    if (!driver) return { message: "disconnect needs a driver id." };
    await deleteToken(options.workspaceRoot, driver);
    await revokePurpose(options.workspaceRoot, DRIVER_CONSENT[driver]);
    return { message: `Disconnected ${DRIVER_LABELS[driver]}.` };
  }
  if (action === "start" || action === "connect") {
    const driver = parseDriverId(args.driver);
    await persistClientCredentials(options.workspaceRoot, driver, args);
    if (options.startOAuth && driver) {
      return options.startOAuth(driver);
    }
    return startOAuth(options, args, env, context);
  }
  return {
    message:
      "integrations action must be catalog, setup, start, or disconnect.",
  };
}

async function persistClientCredentials(
  workspaceRoot: string,
  driver: DriverId | undefined,
  args: Record<string, unknown>,
): Promise<void> {
  if (!driver) return;
  const clientId = stringArg(args.clientId ?? args.client_id);
  if (!clientId) return;
  const clientSecret = stringArg(args.clientSecret ?? args.client_secret);
  await saveOAuthApp(workspaceRoot, driver, {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
  });
}

function stringArg(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

async function startOAuth(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
): Promise<unknown> {
  const driver = parseDriverId(args.driver);
  if (!driver) {
    return {
      message:
        "Name a driver: github, linear, jira, slack, notion, google-calendar (or say “google calendar”).",
    };
  }
  await persistClientCredentials(options.workspaceRoot, driver, args);
  const provider = OAUTH_PROVIDERS[driver];
  const credentials = await resolveOAuthClient(
    options.workspaceRoot,
    provider,
    env,
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  if (credentials.clientId) {
    return startDirectOAuth(
      options,
      driver,
      {
        clientId: credentials.clientId,
        ...(credentials.clientSecret
          ? { clientSecret: credentials.clientSecret }
          : {}),
      },
      context,
    );
  }

  const broker = authBrokerUrl(env);
  const catalog = await listBrokerDrivers(broker, fetchImpl);
  const enabled =
    catalog.drivers.find((row) => row.id === driver)?.enabled === true;
  if (!catalog.reachable) {
    const detail = catalog.reason ? ` (${catalog.reason})` : "";
    return {
      broker,
      reachable: false,
      message: `Prism Auth (${broker}) is unreachable${detail}. Try “connect ${DRIVER_LABELS[driver]}” again in a moment. You do not create an OAuth app.`,
    };
  }
  if (!enabled) {
    return {
      broker,
      brokerEnabled: false,
      message: `${DRIVER_LABELS[driver]} is not enabled on Prism Auth yet. Prism registers that vendor app once — you do not create an OAuth client.`,
    };
  }

  const state = randomUUID();
  const authorizeUrl = brokerStartUrl(broker, driver, state);
  const grant = await collectGrant(
    context?.oauthUi ?? options.oauthUi,
    context?.signal,
    driver,
    authorizeUrl,
    state,
  );
  if (!grant.ok) return grant.result;
  const bundle = await redeemBrokerPickup(
    broker,
    grant.callback.code,
    fetchImpl,
  );
  return finishConnected(
    options,
    driver,
    grant.steps,
    grant.presentation,
    bundle,
  );
}

async function startDirectOAuth(
  options: DispatchRuntimeOptions,
  driver: DriverId,
  credentials: { clientId: string; clientSecret?: string },
  context?: DispatchToolContext,
): Promise<unknown> {
  const provider = OAUTH_PROVIDERS[driver];
  const clientId = credentials.clientId;
  const pkce = provider.usePkce ? createPkce() : undefined;
  const state = randomUUID();
  const grant = await collectGrant(
    context?.oauthUi ?? options.oauthUi,
    context?.signal,
    driver,
    (redirectUri) =>
      buildAuthorizeUrl({
        provider,
        clientId,
        redirectUri,
        state,
        ...(pkce ? { challenge: pkce.challenge } : {}),
      }),
    state,
  );
  if (!grant.ok) return grant.result;
  const secret = credentials.clientSecret;
  const bundle = await exchangeCode({
    provider,
    clientId,
    ...(secret ? { clientSecret: secret } : {}),
    redirectUri: grant.callback.redirectUri,
    code: grant.callback.code,
    ...(pkce ? { verifier: pkce.verifier } : {}),
  });
  await saveToken(options.workspaceRoot, driver, bundle);
  await grantPurpose(options.workspaceRoot, DRIVER_CONSENT[driver]);
  return connectedResult(driver, grant.steps, grant.presentation);
}

type AuthorizeUrlFactory = string | ((redirectUri: string) => string);

async function collectGrant(
  oauthUi: OAuthUiPort | undefined,
  signal: AbortSignal | undefined,
  driver: DriverId,
  authorizeUrlOrFactory: AuthorizeUrlFactory,
  expectedState: string,
): Promise<
  | {
      ok: true;
      callback: LoopbackResult;
      steps: ConnectStep[];
      presentation: AuthPresentation;
    }
  | { ok: false; result: unknown }
> {
  const label = DRIVER_LABELS[driver];
  let steps = connectPlan(label);
  const total = steps.length;
  const report = async () => {
    const current =
      steps.find((step) => step.status === "active") ??
      steps.find((step) => step.status === "done");
    if (!current || !oauthUi) return;
    const index = steps.findIndex((step) => step.id === current.id) + 1;
    await oauthUi.reportStep(current, index, total);
  };

  if (oauthUi?.confirmConnect) {
    steps = markConnectStep(steps, "confirm", "active");
    await report();
    const confirmed = await oauthUi.confirmConnect(label);
    if (!confirmed) {
      steps = markConnectStep(steps, "confirm", "failed");
      return {
        ok: false,
        result: {
          driver,
          connected: false,
          cancelled: true,
          steps,
          message: `Cancelled connecting ${label}. Say “connect ${label}” when you want to try again.`,
        },
      };
    }
    steps = markConnectStep(steps, "confirm", "done");
  } else {
    steps = skipConnectStep(steps, "confirm");
  }

  steps = markConnectStep(steps, "prepare", "active");
  await report();
  const abort = new AbortController();
  const onToolAbort = () => abort.abort();
  signal?.addEventListener("abort", onToolAbort, { once: true });
  let loopback: Awaited<ReturnType<typeof waitForLoopbackCode>>;
  try {
    loopback = await waitForLoopbackCode({
      timeoutMs: 180_000,
      preferredPort: DISPATCH_OAUTH_LOOPBACK_PORT,
      signal: abort.signal,
    });
  } catch (cause) {
    signal?.removeEventListener("abort", onToolAbort);
    steps = markConnectStep(steps, "prepare", "failed");
    return {
      ok: false,
      result: {
        redirectUri: DISPATCH_OAUTH_REDIRECT_URI,
        steps,
        message: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
  steps = markConnectStep(steps, "prepare", "done");

  const authorizeUrl =
    typeof authorizeUrlOrFactory === "function"
      ? authorizeUrlOrFactory(loopback.redirectUri)
      : authorizeUrlOrFactory;

  steps = markConnectStep(steps, "authenticate", "active");
  await report();
  const elicitationId = randomUUID();
  const session = oauthUi
    ? await oauthUi.beginAuth({
        driverLabel: label,
        authorizeUrl,
        elicitationId,
      })
    : await fallbackOpenAuth(authorizeUrl);

  let callback: LoopbackResult;
  try {
    const raced = await Promise.race([
      loopback.done.then((value) => ({ kind: "callback" as const, value })),
      session.userRejected.then((action) => ({
        kind: "rejected" as const,
        action,
      })),
    ]);
    if (raced.kind === "rejected") {
      abort.abort();
      void loopback.done.catch(() => undefined);
      steps = markConnectStep(steps, "authenticate", "failed");
      return {
        ok: false,
        result: {
          driver,
          connected: false,
          cancelled: true,
          presentation: session.presentation,
          steps,
          agentHint: presentationHint(session.presentation),
          message: `Cancelled connecting ${label}.`,
        },
      };
    }
    callback = raced.value;
    await Promise.race([
      session.complete(),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
  } catch (cause) {
    abort.abort();
    void loopback.done.catch(() => undefined);
    steps = markConnectStep(steps, "authenticate", "failed");
    return {
      ok: false,
      result: {
        authorizeUrl,
        redirectUri: loopback.redirectUri,
        presentation: session.presentation,
        steps,
        agentHint: presentationHint(session.presentation),
        message: `Finish connecting ${label} — ${presentationHint(session.presentation)}${cause instanceof Error ? ` (${cause.message})` : ""}`,
      },
    };
  } finally {
    session.abort();
    signal?.removeEventListener("abort", onToolAbort);
  }

  if (callback.state && callback.state !== expectedState) {
    steps = markConnectStep(steps, "authenticate", "failed");
    return {
      ok: false,
      result: { message: "OAuth state mismatch — try connect again.", steps },
    };
  }
  steps = markConnectStep(steps, "authenticate", "done");
  steps = markConnectStep(steps, "store", "active");
  await report();
  return {
    ok: true,
    callback,
    steps,
    presentation: session.presentation,
  };
}

async function fallbackOpenAuth(authorizeUrl: string) {
  await openInBrowser(authorizeUrl);
  return silentAuthSession("opened-page");
}

async function finishConnected(
  options: DispatchRuntimeOptions,
  driver: DriverId,
  steps: ConnectStep[],
  presentation: AuthPresentation,
  bundle: Awaited<ReturnType<typeof redeemBrokerPickup>>,
): Promise<unknown> {
  await saveToken(options.workspaceRoot, driver, bundle);
  await grantPurpose(options.workspaceRoot, DRIVER_CONSENT[driver]);
  return connectedResult(driver, steps, presentation);
}

function connectedResult(
  driver: DriverId,
  steps: ConnectStep[],
  presentation: AuthPresentation,
): unknown {
  const done = markConnectStep(
    markConnectStep(steps, "store", "done"),
    "done",
    "done",
  );
  const label = DRIVER_LABELS[driver];
  return {
    driver,
    connected: true,
    presentation,
    steps: done,
    agentHint: `Connected. ${label} will show up on start my day. Do not ask for a client id.`,
    message: `Connected ${label}. It will show up on the next start-my-day.`,
  };
}

async function configureTool(
  workspaceRoot: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const action = String(args.action ?? "get").trim();
  if (action === "export") {
    const exported = await exportSettings(
      workspaceRoot,
      args.includeMemories === true,
    );
    return {
      settings: exported,
      message:
        "Exported non-secret Dispatch settings. Tokens are not included. Share the JSON if you want the same standup layout elsewhere.",
    };
  }
  if (action === "get") {
    const config = await loadConfig(workspaceRoot);
    return {
      config,
      message: `${SHARED_DISPATCH_CONFIG_SPEAK} ${formatConfig(config)}`,
    };
  }
  const patchRaw = args.patch ?? args.config ?? args;
  const patch =
    patchRaw && typeof patchRaw === "object"
      ? (patchRaw as Record<string, unknown>)
      : {};

  // Free-form wishes first (M-066 P-P9): "configure" never says no — a wish
  // that is not a typed setting becomes a standing preference.
  const current = await loadConfig(workspaceRoot);
  let preferences = current.preferences;
  const preferenceNotes: string[] = [];
  const addPreference = String(
    args.preference ?? args.pref ?? patch.preference ?? "",
  ).trim();
  if (addPreference) {
    preferences = [...preferences, addPreference];
    preferenceNotes.push(`Noted: "${addPreference}"`);
  }
  const removePreference = String(
    args.removePreference ?? patch.removePreference ?? "",
  ).trim();
  if (removePreference) {
    const before = preferences.length;
    preferences = preferences.filter(
      (item) => !item.includes(removePreference),
    );
    preferenceNotes.push(
      before === preferences.length
        ? `No preference matched "${removePreference}".`
        : `Dropped ${before - preferences.length} preference(s).`,
    );
  }

  const allowed: Partial<DispatchConfig> = {};
  const parsed = DispatchConfigSchema.partial().safeParse({
    sectionOrder: patch.sectionOrder,
    sectionsOff: patch.sectionsOff,
    standupTemplate: patch.standupTemplate,
    hints: patch.hints,
    maxJobs: patch.maxJobs,
    subagents: patch.subagents,
    fanout: patch.fanout,
    verifyJobs: patch.verifyJobs,
    workerBackend: patch.workerBackend,
    placement: patch.placement,
    dispatchMode: patch.dispatchMode,
    ticketHost: patch.ticketHost,
    mentionWindowHours: patch.mentionWindowHours,
    mentionLimit: patch.mentionLimit,
    trackedMessageLimit: patch.trackedMessageLimit,
    slackTrackChannelIds: patch.slackTrackChannelIds,
    preferences,
  });
  if (!parsed.success) {
    return { message: `Invalid configure patch: ${parsed.error.message}` };
  }
  Object.assign(allowed, parsed.data);

  // Unknown keys must not silently drop: they become preferences, loudly.
  const KNOWN_PATCH_KEYS = new Set([
    "action",
    "patch",
    "config",
    "preference",
    "pref",
    "removePreference",
    "includeMemories",
    ...Object.keys(DispatchConfigSchema.shape),
  ]);
  for (const [key, value] of Object.entries(patch)) {
    if (KNOWN_PATCH_KEYS.has(key) || value === undefined) continue;
    const note = `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
    allowed.preferences = [...(allowed.preferences ?? preferences), note];
    preferenceNotes.push(
      `"${key}" is not a Dispatch setting, so I kept it as a standing preference ("${note}").`,
    );
  }

  const config = await saveConfig(workspaceRoot, allowed);
  const message = [
    SHARED_DISPATCH_CONFIG_SPEAK,
    formatConfig(config),
    ...preferenceNotes,
  ]
    .filter(Boolean)
    .join(" — ");
  return { config, message };
}

function formatConfig(config: DispatchConfig): string {
  return [
    `hints=${config.hints}`,
    `maxJobs=${config.maxJobs}`,
    `subagents=${config.subagents}`,
    `fanout=${config.fanout}`,
    `verifyJobs=${config.verifyJobs}`,
    `workerBackend=${config.workerBackend}`,
    `placement=${config.placement}`,
    `dispatchMode=${config.dispatchMode}`,
    `ticketHost=${config.ticketHost}`,
    `slack channels=${config.slackTrackChannelIds.join(",") || "(none)"}`,
    `mention window=${config.mentionWindowHours}h cap=${config.mentionLimit}`,
    config.preferences.length > 0
      ? `preferences: ${config.preferences.join(" · ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

async function initTool(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
): Promise<unknown> {
  const creds = await resolveWorkerAuth(options, env, context, { login: true });
  return {
    ready: creds.ready,
    message: creds.ready ? initSpeak(true, creds.email) : creds.message,
  };
}

/** Which agent CLI runs the next job (ADR-0044 §2). */
async function resolveBackend(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
): Promise<WorkerBackend> {
  if (options.workerBackend) return options.workerBackend;
  const config = await loadConfig(options.workspaceRoot).catch(() => undefined);
  return resolveWorkerBackend({
    config,
    env,
    clientName: options.getClientName?.(),
  });
}

/** The port for a backend. Cursor stays `options.worker` (pre-M-065 seam). */
function workerForBackend(
  options: DispatchRuntimeOptions,
  backend: WorkerBackend,
): WorkerPort | undefined {
  return backend === "claude" ? options.claudeWorker : options.worker;
}

async function resolveWorkerAuth(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
  flags: { readonly login?: boolean; readonly backend?: WorkerBackend } = {},
): Promise<WorkerAuthInspect> {
  const backend = flags.backend ?? (await resolveBackend(options, env));
  if (backend === "claude") {
    const auth = options.claudeAuth ?? createClaudeAuthPort({ env });
    return ensureClaudeWorkerAuth({ env, auth });
  }
  const auth = options.cursorAuth ?? (await createSdkCursorAuthPort());
  if (!flags.login) {
    let status:
      | { kind: "stored"; email?: string; expiresAtMs?: number }
      | { kind: "missing" }
      | undefined;
    if (!env.CURSOR_API_KEY?.trim() && auth) {
      status = await auth.status();
    }
    return inspectCursorWorkerAuth(env, status);
  }
  return ensureCursorWorkerAuth({
    env,
    ...(auth ? { auth } : {}),
    ...(context?.signal ? { signal: context.signal } : {}),
  });
}

async function doctorTool(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  const backend = await resolveBackend(options, env);
  const sdk = backend === "cursor" ? await loadCursorSdk() : undefined;
  const config = await loadConfig(options.workspaceRoot);
  const jobs = await reapJobs(options.workspaceRoot);
  const broker = authBrokerUrl(env);
  const brokerCatalog = await listBrokerDrivers(
    broker,
    options.fetchImpl ?? fetch,
  );
  const enabledCount = brokerCatalog.drivers.filter(
    (row) => row.enabled,
  ).length;
  const creds = await resolveWorkerAuth(options, env, undefined, { backend });
  const diskMessage = await diskBudgetMessage(options.workspaceRoot);
  const ramMessage = ramGate(options);
  const git = await gitSnapshot(options.workspaceRoot, options.git);
  const workerChecks =
    backend === "claude"
      ? [
          {
            id: "claude_workers",
            ok: creds.ready,
            detail: creds.ready
              ? signedInSpeak(creds.email)
              : "Claude Code needs a sign-in — say prism init for the steps.",
          },
        ]
      : [
          {
            id: "cursor_workers",
            ok: creds.ready,
            detail: creds.ready
              ? signedInSpeak(creds.email)
              : "Sign in — say prism init and finish the Cursor page in your browser.",
          },
          {
            id: "cursor_sdk",
            ok: Boolean(sdk),
            detail: sdk
              ? "importable"
              : "Cursor SDK did not load — reload prism MCP",
          },
        ];
  const checks = [
    {
      id: "git",
      ok: !git.error,
      detail: git.error
        ? "not a git repository"
        : git.branch || "git repository",
    },
    {
      id: "worker_backend",
      ok: true,
      detail: workerBackendLabel(backend),
    },
    ...workerChecks,
    {
      id: "role",
      ok: !isWorkerRole(env),
      detail: isWorkerRole(env) ? "worker" : "host",
    },
    {
      id: "jobs",
      ok: activeJobCount(jobs) <= config.maxJobs,
      detail: `${activeJobCount(jobs)} active / ${config.maxJobs} max`,
    },
    {
      id: "disk",
      ok: !diskMessage,
      detail: diskMessage ?? "enough free space",
    },
    {
      id: "ram",
      ok: !ramMessage,
      detail: ramMessage ?? "enough free memory",
    },
    {
      id: "prism_auth",
      ok: brokerCatalog.reachable,
      detail: brokerCatalog.reachable
        ? `${broker} · ${enabledCount} connector(s) enabled`
        : `${broker} unreachable${brokerCatalog.reason ? ` (${brokerCatalog.reason})` : ""} — connect will wait until Prism Auth is up`,
    },
  ];
  return {
    checks,
    message: doctorSpeak(checks),
  };
}

export type { GitRunner };
