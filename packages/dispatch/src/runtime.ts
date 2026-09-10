import { access } from "node:fs/promises";
import { buildDayBriefing, type BriefingDeps } from "./briefing.js";
import { discoverHostConnectors } from "./host-connectors.js";
import { loadConfig, saveConfig } from "./config.js";
import { exportSettings } from "./export-settings.js";
import {
  commitJobPaths,
  defaultBaseBranch,
  gitSnapshot,
  gitStatusShort,
  gitCheckoutReview,
  hasGitRepo,
  mergeJobBranch,
  restoreCheckoutPaths,
  defaultGitRunner,
  type GitRunner,
} from "./git.js";
import { allocateJobId, resolveJobRef } from "./job-id.js";
import { verifyJobWork, type VerificationResult } from "./job-verify.js";
import {
  agentNameForJob,
  alreadyRunningSpeak,
  ambiguousJobSpeak,
  controlSpeak,
  doctorSpeak,
  gitFailureSpeak,
  initSpeak,
  isLiveJobStatus,
  analysisSpeak,
  jobLogsSpeak,
  jobRef,
  listJobsSpeak,
  missingJobSpeak,
  needsConfirmSpeak,
  queuedJobSpeak,
  queuedWhileAsleepSpeak,
  recordedJobSpeak,
  signedInSpeak,
  sleepConfirmSpeak,
  sleepSpeak,
  alreadyAsleepSpeak,
  wakeConfirmSpeak,
  wakeSpeak,
  alreadyAwakeSpeak,
  listJobsAsleepSpeak,
} from "./job-voice.js";
import { activeJobCount, deleteJob, loadJobs, upsertJob } from "./jobs.js";
import { kickDrain, requeueAuthBlocked, type DrainDeps } from "./queue.js";
import {
  isInProcessJobStatus,
  isPrismAsleep,
  listedWorkspaceRoots,
  putPrismToSleep,
  wakePrism,
  type SleptJob,
} from "./sleep.js";
import { readRunLog } from "./run-log.js";
import {
  clearRunState,
  isProcessAlive,
  isReusableLiveJob,
  killWorkerTree,
  patchRunState,
  readRunState,
  reapJobs,
} from "./run-state.js";
import { forgetMemory, loadMemories, remember } from "./memory.js";
import { isSkillPlaybook } from "./playbook.js";
import { listSkills, readSkill, skillSpeak } from "./skills.js";
import {
  DispatchConfigSchema,
  type DispatchConfig,
  type JobPlacement,
  type JobRecord,
  type JobOrigin,
  type MemoryScope,
} from "./types.js";
import {
  loadCursorSdk,
  resolveMcpLaunch,
  composeWorkerPrompt,
  verificationFixExtra,
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
import { pruneOrphanWorktrees } from "./worktrees.js";
import {
  admissionMessage,
  diskBudgetMessage,
  ramBudgetMessage,
} from "./worker-budget.js";
import { linkWorktreeInstall } from "./worktree-install.js";
import { requestedWorkerModel, cursorModelForSpawn } from "./worker-models.js";

export const DISPATCH_TOOL_NAMES = [
  "start_my_day",
  "init",
  "sleep",
  "wake",
  "start_job",
  "list_jobs",
  "job_logs",
  "job_control",
  "remember",
  "use_skill",
  "configure",
  "dispatch_doctor",
] as const;

export type DispatchToolName = (typeof DISPATCH_TOOL_NAMES)[number];

export const WORKER_HIDDEN_TOOLS: readonly DispatchToolName[] = [
  "start_my_day",
  "init",
  "sleep",
  "wake",
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
  readonly signal?: AbortSignal;
};

export type DispatchRuntime = {
  readonly workspaceRoot: string;
  handle(
    name: DispatchToolName,
    args: Record<string, unknown>,
    context?: DispatchToolContext,
  ): Promise<unknown>;
  /** Dependencies for `drainWorkspace` (ADR-0047). */
  drainDeps(): DrainDeps;
};

export type DispatchRuntimeOptions = BriefingDeps & {
  readonly worker?: WorkerPort;
  /** Claude Code backend (ADR-0044). Chosen per job by resolveWorkerBackend. */
  readonly claudeWorker?: WorkerPort;
  readonly fetchImpl?: typeof fetch;
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
  /** Injected in tests. Production runs typecheck then test in the job tree. */
  readonly verifyWork?: (
    cwd: string,
    options?: { enabled?: boolean },
  ) => Promise<VerificationResult>;
  /**
   * Console / hub: return as soon as checks start so the HTTP request is not
   * stuck behind a multi-minute typecheck. Tests leave this unset and wait.
   */
  readonly deferVerify?: boolean;
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
    /**
     * The closure set the queue drain needs (ADR-0047), so an always-on
     * process like the hub can advance this workspace's queue without
     * reaching into runtime internals.
     */
    drainDeps() {
      return drainDepsFor(options, env);
    },
    async handle(name, args, context) {
      if (
        isWorkerRole(env) &&
        (name === "start_my_day" ||
          name === "start_job" ||
          name === "init" ||
          name === "sleep" ||
          name === "wake")
      ) {
        return {
          message:
            "This Prism process is a Dispatch worker. It cannot start jobs or standups.",
        };
      }
      switch (name) {
        case "start_my_day":
          await reapJobs(options.workspaceRoot);
          return buildDayBriefing(options);
        case "init":
          return initTool(options, env, context);
        case "sleep":
          return sleepTool(options, args, env);
        case "wake":
          return wakeTool(options, args, env, context);
        case "start_job":
          return startJob(options, args, env, context);
        case "list_jobs":
          return listJobs(options, args, env);
        case "job_logs":
          return jobLogs(options, args);
        case "job_control":
          return jobControl(options, args, env, context);
        case "remember":
          return rememberTool(options.workspaceRoot, args);
        case "use_skill":
          return useSkillTool(args, env);
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

const JOB_ORIGINS: readonly JobOrigin[] = [
  "retry",
  "reverify",
  "finding",
  "instruct",
];

function parseOrigin(value: unknown): JobOrigin | undefined {
  return typeof value === "string" &&
    (JOB_ORIGINS as readonly string[]).includes(value)
    ? (value as JobOrigin)
    : undefined;
}

function hostClientOf(
  options: DispatchRuntimeOptions,
  args?: Record<string, unknown>,
): string | undefined {
  const fromArgs = String(args?.hostClient ?? "").trim();
  if (fromArgs) return fromArgs;
  const fromClient = options.getClientName?.()?.trim();
  return fromClient || undefined;
}

async function createLinkedChild(
  options: DispatchRuntimeOptions,
  parent: JobRecord,
  input: {
    readonly origin: JobOrigin;
    readonly prd?: string;
    readonly extra?: string;
    readonly hostClient?: string;
    readonly status?: JobRecord["status"];
    readonly lastActivity?: string;
  },
): Promise<JobRecord> {
  const jobs = await loadJobs(options.workspaceRoot);
  const id = jobIdFrom(parent.title, new Set(jobs.map((job) => job.id)));
  const now = new Date().toISOString();
  const extra = input.extra?.trim();
  const hostClient = input.hostClient ?? parent.hostClient;
  return upsertJob(options.workspaceRoot, {
    id,
    title: parent.title,
    playbook: parent.playbook,
    prd: input.prd ?? parent.prd,
    branch: parent.branch,
    worktreePath: parent.worktreePath,
    source: parent.source,
    status: input.status ?? "queued",
    lastStep: "",
    nextStep:
      input.status === "queued" ? "waiting for a slot" : parent.nextStep,
    waitingOn: "",
    workerBackend: parent.workerBackend,
    ...(parent.workerModel ? { workerModel: parent.workerModel } : {}),
    ...(parent.placement ? { placement: parent.placement } : {}),
    ...(parent.preExistingChanges
      ? { preExistingChanges: parent.preExistingChanges }
      : {}),
    parentJobId: parent.id,
    origin: input.origin,
    ...(hostClient ? { hostClient } : {}),
    ...(parent.verification ? { verification: parent.verification } : {}),
    ...(parent.verificationDetail
      ? { verificationDetail: parent.verificationDetail }
      : {}),
    createdAt: now,
    queuedAt: now,
    updatedAt: now,
    lastActivity: input.lastActivity ?? "Queued",
    ...(extra ? { pendingContext: extra } : {}),
  });
}

function isWorkingJobStatus(status: string): boolean {
  return (
    status === "queued" ||
    status === "booting" ||
    status === "running" ||
    status === "ready"
  );
}

async function firstExistingDir(
  paths: readonly string[],
): Promise<string | undefined> {
  const seen = new Set<string>();
  for (const path of paths) {
    const cwd = path.trim();
    if (!cwd || seen.has(cwd)) continue;
    seen.add(cwd);
    try {
      await access(cwd);
      return cwd;
    } catch {
      /* try the next candidate */
    }
  }
  return undefined;
}

/**
 * After Retry verification still fails, start a teammate whose brief is the
 * check failure — not the original PRD. Prism re-runs typecheck/test when
 * that teammate stops.
 */
async function launchVerificationFix(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
  context: DispatchToolContext | undefined,
  launch: ReturnType<typeof resolveMcpLaunch>,
  job: JobRecord,
  cwd: string,
  failureDetail: string,
): Promise<{ readonly job: JobRecord; readonly message: string }> {
  const abort = async (message: string) => {
    await patchSidecarIfPresent(options.workspaceRoot, job.id, {
      verification: "failed",
      verificationDetail: failureDetail,
      lastActivity: "Could not start a teammate",
    });
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      lastActivity: "Could not start a teammate",
      verification: "failed",
      verificationDetail: failureDetail,
    });
    return { job: next, message };
  };
  const backend = job.workerBackend ?? "cursor";
  const creds = await resolveWorkerAuth(options, env, context, {
    login: true,
    backend,
  });
  if (!creds.ready) {
    return abort(creds.message);
  }
  const worker = workerForBackend(options, backend);
  if (!worker) {
    return abort("No worker configured.");
  }
  const ram = ramGate(options);
  if (ram) return abort(ram);
  const disk = await diskBudgetMessage(options.workspaceRoot);
  if (disk) return abort(disk);
  if (job.source === "prism") {
    await linkWorktreeInstall({
      workspaceRoot: options.workspaceRoot,
      worktreePath: cwd,
    });
  }
  const config = await loadConfig(options.workspaceRoot);
  const jobPlacement = job.placement ?? "worktree";
  const [memories, spawnModel] = await Promise.all([
    loadMemories(options.workspaceRoot),
    backend === "cursor"
      ? cursorModelForSpawn(job.workerModel)
      : Promise.resolve(job.workerModel),
  ]);
  await clearRunState(options.workspaceRoot, job.id);
  let pid: number | undefined;
  let agentId: string | undefined;
  try {
    const started = await worker.start({
      jobId: job.id,
      cwd,
      name: agentNameForJob(job),
      mcpCommand: launch.command,
      mcpArgs: launch.args,
      workspaceRoot: options.workspaceRoot,
      prompt: await composeWorkerPrompt({
        job,
        memories,
        extra: verificationFixExtra(failureDetail),
        subagents: config.subagents,
        placement: jobPlacement,
        jobInstructions: config.jobInstructions,
        workspaceRoot: options.workspaceRoot,
      }),
      title: job.title,
      baseRef: await defaultBaseRef(options),
      subagents: config.subagents,
      verify: true,
      placement: jobPlacement,
      ...(job.branch ? { branch: job.branch } : {}),
      ...(job.preExistingChanges
        ? { preExistingChanges: job.preExistingChanges }
        : {}),
      ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
      ...(spawnModel ? { model: spawnModel } : {}),
    });
    agentId = started.agentId;
    if (typeof started.pid === "number") pid = started.pid;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return abort(
      detail.trim()
        ? `Could not start a teammate to fix ${jobRef(job)}: ${detail.trim()}`
        : `Could not start a teammate to fix ${jobRef(job)}.`,
    );
  }
  const retryAt = new Date().toISOString();
  const next = await upsertJob(options.workspaceRoot, {
    ...job,
    status: "running",
    startedAt: retryAt,
    queuedAt: retryAt,
    lastActivity: "Starting",
    errorMessage: undefined,
    pendingContext: undefined,
    waitingOn: "",
    nextStep: "",
    verification: undefined,
    verificationDetail: undefined,
    workerSessionId: undefined,
    runId: undefined,
    claudeSession: undefined,
    lastHeartbeat: undefined,
    ...(spawnModel ? { workerModel: spawnModel } : {}),
    ...(agentId ? { cursorAgentId: agentId } : { cursorAgentId: undefined }),
    ...(typeof pid === "number"
      ? { workerPid: pid }
      : { workerPid: undefined }),
  });
  return {
    job: next,
    message: `${jobRef(next)} — checks still failing; a teammate is fixing them.`,
  };
}

async function retryAsChildJob(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
  context: DispatchToolContext | undefined,
  launch: ReturnType<typeof resolveMcpLaunch>,
  parent: JobRecord,
  extra: string,
): Promise<{ readonly job: JobRecord; readonly message: string }> {
  const backend = parent.workerBackend ?? "cursor";
  const creds = await resolveWorkerAuth(options, env, context, {
    login: true,
    backend,
  });
  if (!creds.ready) {
    return { message: creds.message, job: parent };
  }
  const resumeWorker = workerForBackend(options, backend);
  if (!resumeWorker) {
    return { message: "No worker configured.", job: parent };
  }
  const ram = ramGate(options);
  if (ram) return { message: ram, job: parent };
  const disk = await diskBudgetMessage(options.workspaceRoot);
  if (disk) return { message: disk, job: parent };
  if (parent.source === "prism") {
    await linkWorktreeInstall({
      workspaceRoot: options.workspaceRoot,
      worktreePath: parent.worktreePath,
    });
  }
  const hostClient = hostClientOf(options);
  const child = await createLinkedChild(options, parent, {
    origin: "retry",
    extra,
    ...(hostClient ? { hostClient } : {}),
    status: "queued",
    lastActivity: "Queued",
  });
  const jobPlacement = child.placement ?? parent.placement ?? "worktree";
  const [memories, standing, spawnModel] = await Promise.all([
    loadMemories(options.workspaceRoot),
    loadConfig(options.workspaceRoot).then((row) => row.jobInstructions),
    backend === "cursor"
      ? cursorModelForSpawn(child.workerModel ?? parent.workerModel)
      : Promise.resolve(child.workerModel ?? parent.workerModel),
  ]);
  const cwd = child.worktreePath || options.workspaceRoot;
  let pid: number | undefined;
  let agentId: string | undefined;
  try {
    const started = await resumeWorker.start({
      jobId: child.id,
      cwd,
      name: agentNameForJob(child),
      mcpCommand: launch.command,
      mcpArgs: launch.args,
      workspaceRoot: options.workspaceRoot,
      placement: jobPlacement,
      ...(child.preExistingChanges
        ? { preExistingChanges: child.preExistingChanges }
        : {}),
      ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
      ...(spawnModel ? { model: spawnModel } : {}),
      prompt: await composeWorkerPrompt({
        job: child,
        memories,
        extra,
        placement: jobPlacement,
        jobInstructions: standing,
        workspaceRoot: options.workspaceRoot,
      }),
    });
    agentId = started.agentId;
    if (typeof started.pid === "number") pid = started.pid;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const failed = await upsertJob(options.workspaceRoot, {
      ...child,
      status: "error",
      lastActivity: "Could not start a teammate",
      errorMessage: detail.trim() || "The teammate failed to start.",
    });
    return {
      job: failed,
      message: detail.trim()
        ? `Could not retry ${jobRef(parent)}: ${detail.trim()}`
        : `Could not retry ${jobRef(parent)}. The teammate failed to start.`,
    };
  }
  const retryAt = new Date().toISOString();
  const next = await upsertJob(options.workspaceRoot, {
    ...child,
    status: "running",
    startedAt: retryAt,
    queuedAt: retryAt,
    lastActivity: "Starting",
    errorMessage: undefined,
    pendingContext: undefined,
    waitingOn: "",
    nextStep: "",
    ...(spawnModel ? { workerModel: spawnModel } : {}),
    ...(agentId ? { cursorAgentId: agentId } : {}),
    ...(typeof pid === "number" ? { workerPid: pid } : {}),
  });
  return {
    job: next,
    message: controlSpeak("retry", next),
  };
}

function shouldLandWorktree(job: JobRecord): boolean {
  return (
    (job.placement ?? "worktree") !== "checkout" &&
    Boolean(job.branch?.trim()) &&
    job.review?.committed === true
  );
}

async function patchSidecarIfPresent(
  workspaceRoot: string,
  jobId: string,
  patch: Parameters<typeof patchRunState>[2],
): Promise<void> {
  const current = await readRunState(workspaceRoot, jobId);
  if (!current) return;
  await patchRunState(workspaceRoot, jobId, patch);
}

/**
 * Build the dependency bundle the drain loop needs (ADR-0047).
 *
 * `start_job` no longer performs any of this work itself; it hands the closure
 * set to `kickDrain` and returns.
 */
function drainDepsFor(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
): DrainDeps {
  return {
    workspaceRoot: options.workspaceRoot,
    ...(options.git ? { git: options.git } : {}),
    env,
    resolveAuth: async (backend) =>
      await resolveWorkerAuth(options, env, context, { login: true, backend }),
    workerFor: (backend) => workerForBackend(options, backend),
    baseRef: async () => await defaultBaseRef(options),
    ramGate: () => ramGate(options),
    admissionGate: (activeCount, maxJobs) =>
      admissionGate(options, activeCount, maxJobs),
  };
}

async function kickDrainIfAwake(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
  workspaceRoot = options.workspaceRoot,
): Promise<void> {
  if (await isPrismAsleep(env)) return;
  kickDrain(
    drainDepsFor(
      workspaceRoot === options.workspaceRoot
        ? options
        : { ...options, workspaceRoot },
      env,
      context,
    ),
  );
}

/**
 * Compose/MCP can pick checkout vs isolated per job. Settings are only the
 * default when the caller omitted placement. An explicit `branch` still means
 * isolated, but an empty string does not.
 */
function placementForStart(
  args: Record<string, unknown>,
  configPlacement: JobPlacement,
  existing?: JobPlacement,
): JobPlacement {
  // Skills live in ~/.prism, not the repo — never spin a worktree or join
  // a dirty-tree gate for this playbook.
  if (isSkillPlaybook(String(args.playbook ?? ""))) return "checkout";
  if (existing) return existing;
  if (args.placement === "checkout" || args.placement === "worktree") {
    return args.placement;
  }
  if (typeof args.worktreePath === "string" && args.worktreePath.trim()) {
    return "worktree";
  }
  if (typeof args.branch === "string" && args.branch.trim()) {
    return "worktree";
  }
  return configPlacement;
}

/**
 * Accept a job and return (M-067 P-S1, ADR-0047).
 *
 * The budget is under 500ms, which rules out everything that used to live
 * here: sign-in, `git worktree add`, `reapJobs` over every sidecar, and the
 * worker spawn. All of it moved to `queue.ts`, behind the return.
 *
 * What is left is one file read (to allocate a non-colliding id and spot a
 * duplicate dispatch), one file write, and a fire-and-forget kick.
 */
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

  // The one precondition worth paying for before accepting (ADR-0047): a job
  // outside a repository is not delayed, it is impossible, so queuing it would
  // just move the failure somewhere the user is less likely to look.
  const repo = await hasGitRepo(options.workspaceRoot, options.git);
  if (!repo.ok) {
    return { message: gitFailureSpeak(repo.detail) };
  }

  const config = await loadConfig(options.workspaceRoot);
  const workerModel = requestedWorkerModel(args.workerModel ?? args.model);
  const requested =
    args.workerBackend === "cursor" || args.workerBackend === "claude"
      ? args.workerBackend
      : undefined;
  const backend =
    requested ??
    options.workerBackend ??
    resolveWorkerBackend({
      config,
      env,
      clientName: options.getClientName?.(),
    });

  // `loadJobs`, not `reapJobs`: reconciling every run sidecar is the drain
  // loop's job now, and it is the single most expensive thing this handler
  // used to do.
  const jobs = await loadJobs(options.workspaceRoot);
  const parentJobId = String(args.parentJobId ?? "").trim();
  const requestedId = args.jobId ?? args.id;
  const id = jobIdFrom(
    title,
    new Set(jobs.map((job) => job.id)),
    parentJobId && String(requestedId ?? "").trim() === parentJobId
      ? undefined
      : requestedId,
  );
  const existing = jobs.find((job) => job.id === id);

  if (existing && isReusableLiveJob(existing)) {
    return { job: existing, message: alreadyRunningSpeak(existing) };
  }
  if (existing && existing.status === "queued") {
    return {
      job: existing,
      message: recordedJobSpeak(
        existing,
        "it is already in the queue and will start on its own.",
      ),
    };
  }

  // Answering a gate: a re-dispatch carrying a confirm flag records the grant
  // and drops the pending question, so the drain stops asking.
  const granted = new Set(existing?.confirmed ?? []);
  if (args.confirmDirty === true) granted.add("confirmDirty");
  if (args.confirmOverlap === true) granted.add("confirmOverlap");
  const pendingAnswered =
    existing?.confirm !== undefined && granted.has(existing.confirm.arg);

  const placement: JobPlacement = placementForStart(
    args,
    config.placement,
    existing?.placement,
  );

  const now = new Date().toISOString();
  const job: JobRecord = {
    ...existing,
    id,
    title,
    playbook: String(args.playbook ?? "ticket"),
    prd,
    // Placement resolves in the drain; an empty tree means "not placed yet".
    branch:
      existing?.branch ?? (typeof args.branch === "string" ? args.branch : ""),
    worktreePath:
      existing?.worktreePath ??
      (typeof args.worktreePath === "string" ? args.worktreePath.trim() : ""),
    source: existing?.source ?? "checkout",
    status: "queued",
    lastStep: "",
    nextStep: "waiting for a slot",
    waitingOn: "",
    workerBackend: backend,
    ...(workerModel ? { workerModel } : {}),
    placement,
    ...(parentJobId ? { parentJobId } : {}),
    ...(parseOrigin(args.origin)
      ? { origin: parseOrigin(args.origin) }
      : parentJobId
        ? { origin: "finding" as const }
        : {}),
    ...(hostClientOf(options, args)
      ? { hostClient: hostClientOf(options, args) }
      : {}),
    createdAt: existing?.createdAt ?? now,
    queuedAt: now,
    updatedAt: now,
    lastActivity: "Queued",
    workerPid: undefined,
    cursorAgentId: undefined,
    claudeSession: undefined,
    workerSessionId: undefined,
    runId: undefined,
    lastHeartbeat: undefined,
    resultSummary: undefined,
    errorMessage: undefined,
    startedAt: undefined,
    finishedAt: undefined,
    ...(granted.size > 0 ? { confirmed: [...granted] } : {}),
    // Keep an unanswered question so the board still shows it; drop it once
    // the matching grant arrives.
    ...(existing?.confirm && !pendingAnswered
      ? { confirm: existing.confirm }
      : {}),
  };
  if (pendingAnswered) delete (job as { confirm?: unknown }).confirm;

  // Same slug after cancel/delete leaves a cancelled sidecar; reap would
  // immediately overwrite this queued row. Kill a leftover pid first so a
  // retried start_job cannot orphan two teammates on one job.
  if (existing?.workerPid && existing.workerPid !== process.pid) {
    killWorkerTree(existing.workerPid);
  }
  await clearRunState(options.workspaceRoot, id);
  const saved = await upsertJob(options.workspaceRoot, job);

  if (await isPrismAsleep(env)) {
    return {
      job: saved,
      message: queuedWhileAsleepSpeak(saved),
    };
  }

  await kickDrainIfAwake(options, env, context);

  return {
    job: saved,
    message: queuedJobSpeak(saved),
  };
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

async function listJobs(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  const waitFor = String(args.waitFor ?? "").trim();
  const timeoutMs = Math.min(
    Math.max(
      typeof args.timeoutMs === "number" ? args.timeoutMs : 180_000,
      1_000,
    ),
    600_000,
  );
  const asleep = await isPrismAsleep(env);
  if (waitFor && !asleep) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const live = await reapJobs(options.workspaceRoot);
      const resolved = resolveJobRef(live, waitFor);
      const job = resolved?.kind === "one" ? resolved.job : undefined;
      if (!job || !isWorkingJobStatus(job.status) || Date.now() >= deadline) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
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
      ...(job.confirm?.question
        ? { confirmQuestion: job.confirm.question }
        : {}),
      ...(job.nextStep ? { nextStep: job.nextStep } : {}),
      ...(job.tokenUsage ? { tokenUsage: job.tokenUsage } : {}),
    });
  }
  let message = listJobsSpeak(rows);
  if (asleep) message = listJobsAsleepSpeak(message);
  if (waitFor) {
    const resolved = resolveJobRef(jobs, waitFor);
    const waited = resolved?.kind === "one" ? resolved.job : undefined;
    if (waited && !isWorkingJobStatus(waited.status)) {
      const page = await readRunLog(options.workspaceRoot, waited.id, {
        limit: 80,
      });
      const analysis = analysisSpeak(page.entries);
      if (analysis) message = `${message}\n\n${analysis}`;
    }
  }
  return {
    jobs: rows,
    message,
  };
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

  if (action === "cancel" || action === "pause" || action === "delete") {
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
    if (action === "delete") {
      await clearRunState(options.workspaceRoot, job.id);
      await deleteJob(options.workspaceRoot, job.id);
      return {
        deleted: true,
        jobId: job.id,
        message: controlSpeak("delete", job),
      };
    }
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      status: action === "cancel" ? "cancelled" : "paused",
      lastActivity: action === "cancel" ? "Cancelled" : "Paused",
      nextStep: action === "cancel" ? "" : "paused — say resume to continue",
    });
    return {
      job: next,
      message: controlSpeak(action === "cancel" ? "cancel" : "pause", next),
    };
  }

  if (action === "reverify") {
    if (
      isWorkingJobStatus(job.status) ||
      job.status === "paused" ||
      job.status === "waiting_on_you" ||
      job.status === "blocked" ||
      job.status === "needs_confirm" ||
      job.lastActivity === "Running checks…"
    ) {
      return {
        job,
        message: `${jobRef(job)} is still in flight — wait until it finishes before re-running checks.`,
      };
    }
    const cwd = await firstExistingDir(
      job.placement === "worktree" && job.review?.merged !== true
        ? [job.worktreePath, options.workspaceRoot]
        : [options.workspaceRoot, job.worktreePath],
    );
    if (!cwd) {
      return {
        job,
        message: `${jobRef(job)} has no tree left to check.`,
      };
    }
    const verify = options.verifyWork ?? verifyJobWork;
    const hostClient = hostClientOf(options);
    const running = await createLinkedChild(options, job, {
      origin: "reverify",
      ...(hostClient ? { hostClient } : {}),
      status: job.status,
      lastActivity: "Running checks…",
    });
    const recordCheck = async (
      checked: VerificationResult,
    ): Promise<{
      readonly job: JobRecord;
      readonly message: string;
    }> => {
      const lastActivity =
        checked.status === "passed" ? "Checks passed" : "Checks failed";
      await patchSidecarIfPresent(options.workspaceRoot, running.id, {
        verification: checked.status,
        verificationDetail: checked.detail,
        lastActivity,
      });
      const next = await upsertJob(options.workspaceRoot, {
        ...running,
        verification: checked.status,
        verificationDetail: checked.detail,
        lastActivity,
      });
      return {
        job: next,
        message: `${jobRef(next)} — ${checked.detail}`,
      };
    };
    const finish = async (): Promise<{
      readonly job: JobRecord;
      readonly message: string;
    }> => {
      const checked = await verify(cwd, { enabled: true });
      if (checked.status !== "failed") {
        return recordCheck(checked);
      }
      return launchVerificationFix(
        options,
        env,
        context,
        launch,
        running,
        cwd,
        checked.detail,
      );
    };
    if (options.deferVerify) {
      void finish().catch(async (cause) => {
        const detail = cause instanceof Error ? cause.message : String(cause);
        await patchSidecarIfPresent(options.workspaceRoot, running.id, {
          verification: "failed",
          verificationDetail: detail,
          lastActivity: "Checks failed",
        }).catch(() => undefined);
        await upsertJob(options.workspaceRoot, {
          ...running,
          verification: "failed",
          verificationDetail: detail,
          lastActivity: "Checks failed",
        }).catch(() => undefined);
      });
      return {
        job: running,
        deferred: true,
        message: `${jobRef(running)} — running checks. If they fail, a teammate will fix them.`,
      };
    }
    const finished = await finish();
    return {
      job: finished.job,
      message: finished.message,
    };
  }

  // Answer a gate the drain parked (ADR-0047). Records the grant, clears the
  // question and re-queues; the drain picks it up from there. This is what the
  // board's Confirm button calls.
  if (action === "confirm") {
    if (job.status !== "needs_confirm" || !job.confirm) {
      return {
        job,
        message: `${jobRef(job)} is not waiting on a confirmation.`,
      };
    }
    const granted = new Set(job.confirmed ?? []);
    granted.add(job.confirm.arg);
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "queued",
      queuedAt: new Date().toISOString(),
      confirmed: [...granted],
      confirm: undefined,
      waitingOn: "",
      nextStep: "waiting for a slot",
    });
    kickDrainIfAwake(options, env, context);
    return { job: next, message: queuedJobSpeak(next) };
  }

  if (
    action === "resume" ||
    action === "retry" ||
    action === "attach_context"
  ) {
    const extra = String(args.context ?? args.text ?? "").trim();
    if (
      action === "retry" &&
      job.status !== "error" &&
      job.status !== "cancelled"
    ) {
      return {
        job,
        message: `${jobRef(job)} is not failed or cancelled — use resume if it is paused.`,
      };
    }
    // A gated job has no worker to resume — it never started. Say what it is
    // waiting for rather than falling through to a spawn that cannot happen.
    if (job.status === "needs_confirm" && action === "resume") {
      return { job, message: needsConfirmSpeak(job) };
    }
    if (isProcessAlive(job.workerPid)) {
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
      // Stalled resume and retry both need a new teammate. A leftover pid on
      // a failed/cancelled job must not look "already running" — that used to
      // skip spawn, and the cancelled sidecar then reaped the row back.
      const stalled =
        job.waitingOn === "stalled" || job.status === "waiting_on_you";
      if (action !== "retry" && !(action === "resume" && stalled)) {
        return { job, message: alreadyRunningSpeak(job) };
      }
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
    }
    if (action === "retry") {
      const combinedExtra = [job.pendingContext, extra]
        .filter(Boolean)
        .join("\n\n");
      return retryAsChildJob(options, env, context, launch, job, combinedExtra);
    }
    const backend = job.workerBackend ?? "cursor";
    const creds = await resolveWorkerAuth(options, env, context, {
      login: true,
      backend,
    });
    if (!creds.ready) {
      return { message: creds.message, job };
    }
    const resumeWorker = workerForBackend(options, backend);
    if (!resumeWorker) {
      return { message: "No worker configured.", job };
    }
    const ram = ramGate(options);
    if (ram) return { message: ram, job };
    const disk = await diskBudgetMessage(options.workspaceRoot);
    if (disk) return { message: disk, job };
    if (job.source === "prism") {
      await linkWorktreeInstall({
        workspaceRoot: options.workspaceRoot,
        worktreePath: job.worktreePath,
      });
    }
    const jobPlacement = job.placement ?? "worktree";
    const combinedExtra = [job.pendingContext, extra]
      .filter(Boolean)
      .join("\n\n");
    const [memories, configRow, spawnModel] = await Promise.all([
      loadMemories(options.workspaceRoot),
      loadConfig(options.workspaceRoot),
      backend === "cursor"
        ? cursorModelForSpawn(job.workerModel)
        : Promise.resolve(job.workerModel),
    ]);
    const promptFields = {
      job,
      memories,
      extra: combinedExtra,
      placement: jobPlacement,
      jobInstructions: configRow.jobInstructions,
      subagents: configRow.subagents,
      workspaceRoot: options.workspaceRoot,
    } as const;
    const placementFields = {
      placement: jobPlacement,
      ...(job.preExistingChanges
        ? { preExistingChanges: job.preExistingChanges }
        : {}),
    } as const;
    let pid: number | undefined;
    let agentId = job.cursorAgentId;
    // The resume handle is backend-specific: Cursor agentId, Claude session_id.
    const sessionHandle =
      backend === "claude" ? job.workerSessionId : job.cursorAgentId;
    const cwd = job.worktreePath || options.workspaceRoot;
    const spawnBase = {
      jobId: job.id,
      cwd,
      name: agentNameForJob(job),
      mcpCommand: launch.command,
      mcpArgs: launch.args,
      workspaceRoot: options.workspaceRoot,
      title: job.title,
      verify: !isSkillPlaybook(job.playbook),
      ...(job.playbook ? { playbook: job.playbook } : {}),
      ...placementFields,
      ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
      ...(spawnModel ? { model: spawnModel } : {}),
    } as const;
    try {
      if (sessionHandle) {
        const resumed = await resumeWorker.resume({
          ...spawnBase,
          agentId: sessionHandle,
          prompt:
            action === "attach_context"
              ? combinedExtra || "Continue."
              : await composeWorkerPrompt(promptFields),
        });
        if (resumed && typeof resumed.pid === "number") pid = resumed.pid;
      } else {
        const started = await resumeWorker.start({
          ...spawnBase,
          prompt: await composeWorkerPrompt(promptFields),
        });
        agentId = started.agentId ?? agentId;
        if (typeof started.pid === "number") pid = started.pid;
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      const verb = action === "attach_context" ? "continue" : "resume";
      return {
        job,
        message: detail.trim()
          ? `Could not ${verb} ${jobRef(job)}: ${detail.trim()}`
          : `Could not ${verb} ${jobRef(job)}. The teammate failed to start.`,
      };
    }
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "running",
      // A job resumed after a pause has a live worker again, so the clock
      // restarts here. `upsertJob` clears `finishedAt` on the way out of a
      // stopped status, which is what un-freezes it.
      startedAt: job.startedAt ?? new Date().toISOString(),
      lastActivity: "Starting",
      errorMessage: undefined,
      pendingContext: undefined,
      waitingOn: "",
      nextStep: "",
      ...(spawnModel ? { workerModel: spawnModel } : {}),
      ...(agentId ? { cursorAgentId: agentId } : {}),
      ...(typeof pid === "number" ? { workerPid: pid } : {}),
    });
    return {
      job: next,
      message: controlSpeak("resume", next),
    };
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

  if (action === "reject_file" || action === "reject_all") {
    if (job.status !== "needs_review" || !job.review) {
      return {
        job,
        message: `${jobRef(job)} is not waiting on a review.`,
      };
    }
    const cwd = job.worktreePath || options.workspaceRoot;
    const paths =
      action === "reject_all"
        ? job.review.files.map((file) => file.path)
        : [String(args.path ?? "").trim()].filter(Boolean);
    if (paths.length === 0) {
      return {
        job,
        message:
          "Say which file to restore, or restore all of the job's files.",
      };
    }
    const result = await restoreCheckoutPaths(
      cwd,
      {
        paths,
        mixedPaths: job.review.mixedPaths,
      },
      options.git ?? defaultGitRunner,
    );
    const review = await gitCheckoutReview(cwd, {
      preExisting: job.preExistingChanges ?? [],
      ...(job.branch ? { branch: job.branch } : {}),
    });
    const keptPaths = (job.review.keptPaths ?? []).filter((path) =>
      review.files.some((file) => file.path === path),
    );
    const nextReview = { ...review, keptPaths };
    const remaining = nextReview.files.filter(
      (file) => !keptPaths.includes(file.path),
    );
    const stillWork = remaining.length > 0;
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      review: nextReview,
      status: stillWork ? "needs_review" : "done",
      nextStep: stillWork ? "review the changes" : "",
      resultSummary: stillWork
        ? `${remaining.length} file(s) still need a look`
        : "Restored the job's files. Your other uncommitted work is untouched.",
    });
    const restored = result.restored.join(", ") || "nothing";
    const skipped = result.skipped.length
      ? ` Left mixed files alone: ${result.skipped.slice(0, 4).join(", ")}.`
      : "";
    return {
      job: next,
      message: stillWork
        ? `Restored ${restored} for ${jobRef(next)}.${skipped} ${review.files.length} file(s) still need a look.`
        : `Restored ${restored} for ${jobRef(next)}.${skipped} Nothing from that job remains.`,
    };
  }

  if (action === "accept_file" || action === "accept_all") {
    if (job.status !== "needs_review" || !job.review) {
      return {
        job,
        message: `${jobRef(job)} is not waiting on a review.`,
      };
    }
    const kept = new Set(job.review.keptPaths ?? []);
    if (action === "accept_all") {
      for (const file of job.review.files) kept.add(file.path);
    } else {
      const path = String(args.path ?? "").trim();
      if (!path) {
        return {
          job,
          message: "Say which file to keep, or keep all of the job's files.",
        };
      }
      kept.add(path);
    }
    const remaining = job.review.files.filter((file) => !kept.has(file.path));
    const stillWork = remaining.length > 0;
    let landInto = "";
    let landAlready = false;
    if (!stillWork && shouldLandWorktree(job)) {
      const land = await mergeJobBranch(
        options.workspaceRoot,
        job.branch ?? "",
        options.git ?? defaultGitRunner,
      );
      if (!land.ok) {
        const held = {
          ...job.review,
          keptPaths: [...kept],
        };
        const next = await upsertJob(options.workspaceRoot, {
          ...job,
          review: held,
          status: "needs_review",
          nextStep: "review the changes",
        });
        return {
          job: next,
          message: `${jobRef(next)} — kept the files but could not merge onto ${land.into ?? "your current branch"}: ${land.error}`,
        };
      }
      landInto = land.into;
      landAlready = land.already;
    }
    const review = {
      ...job.review,
      keptPaths: [...kept],
      merged: Boolean(landInto) || job.review.merged === true,
    };
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      review,
      status: stillWork ? "needs_review" : "done",
      nextStep: stillWork ? "review the changes" : "",
      resultSummary: stillWork
        ? `${remaining.length} file(s) still need a look`
        : landInto
          ? landAlready
            ? `You kept ${kept.size} file(s) from ${jobRef(job)} — already on ${landInto}.`
            : `Merged ${jobRef(job)} onto ${landInto}.`
          : `You kept ${kept.size} file(s) from ${jobRef(job)}.`,
    });
    await patchSidecarIfPresent(options.workspaceRoot, job.id, {
      ...(next.review ? { review: next.review } : {}),
      lastActivity: next.lastActivity ?? next.resultSummary ?? "Kept",
    });
    return {
      job: next,
      message: stillWork
        ? `Kept ${action === "accept_all" ? "those files" : String(args.path)} for ${jobRef(next)}. ${remaining.length} file(s) still need a look.`
        : landInto
          ? landAlready
            ? `Kept the changes from ${jobRef(next)}. They are already on ${landInto}.`
            : `Merged ${jobRef(next)} onto ${landInto}.`
          : `Kept the changes from ${jobRef(next)}. They are still uncommitted in your working tree.`,
    };
  }

  return {
    message:
      "job_control action must be pause, resume, retry, reverify, cancel, delete, attach_context, commit, accept_file, or reject_file.",
    job,
  };
}

async function collectInProcessJobs(
  env: NodeJS.ProcessEnv,
  currentRoot: string,
): Promise<Array<{ workspaceRoot: string; job: JobRecord }>> {
  const out: Array<{ workspaceRoot: string; job: JobRecord }> = [];
  for (const root of await listedWorkspaceRoots(env, currentRoot)) {
    const jobs = await loadJobs(root).catch(() => []);
    for (const job of jobs) {
      if (isInProcessJobStatus(job.status)) {
        out.push({ workspaceRoot: root, job });
      }
    }
  }
  return out;
}

async function pauseJobForSleep(
  options: DispatchRuntimeOptions,
  workspaceRoot: string,
  job: JobRecord,
): Promise<void> {
  const cancelWorker =
    workerForBackend(options, job.workerBackend ?? "cursor") ??
    options.worker ??
    options.claudeWorker;
  if (cancelWorker) {
    await cancelWorker.cancel({
      ...(job.cursorAgentId ? { agentId: job.cursorAgentId } : {}),
      cwd: job.worktreePath,
      jobId: job.id,
      workspaceRoot,
      ...(typeof job.workerPid === "number" ? { pid: job.workerPid } : {}),
    });
  }
  await upsertJob(workspaceRoot, {
    ...job,
    status: "paused",
    lastActivity: "Paused — Prism is asleep",
    nextStep: "paused — say prism wake to continue",
  });
}

async function requeueSleptJob(
  workspaceRoot: string,
  jobId: string,
): Promise<boolean> {
  const jobs = await loadJobs(workspaceRoot);
  const job = jobs.find((row) => row.id === jobId);
  if (!job || job.status !== "paused") return false;
  await upsertJob(workspaceRoot, {
    ...job,
    status: "queued",
    queuedAt: new Date().toISOString(),
    lastActivity: "Waking",
    nextStep: "waiting for a slot",
    waitingOn: "",
  });
  return true;
}

async function sleepTool(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  if (await isPrismAsleep(env)) {
    return { asleep: true, message: alreadyAsleepSpeak() };
  }
  const inProcess = await collectInProcessJobs(env, options.workspaceRoot);
  if (inProcess.length > 0 && args.confirm !== true) {
    return {
      needsConfirm: true,
      asleep: false,
      inProcess: inProcess.map((row) => ({
        jobId: row.job.id,
        title: row.job.title,
      })),
      message: sleepConfirmSpeak(inProcess.map((row) => row.job)),
    };
  }
  const paused: SleptJob[] = [];
  for (const row of inProcess) {
    await pauseJobForSleep(options, row.workspaceRoot, row.job);
    paused.push({ workspaceRoot: row.workspaceRoot, jobId: row.job.id });
  }
  await putPrismToSleep(env, paused);
  return {
    asleep: true,
    paused: paused.length,
    message: sleepSpeak(paused.length),
  };
}

async function wakeTool(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
): Promise<unknown> {
  if (!(await isPrismAsleep(env))) {
    return { asleep: false, message: alreadyAwakeSpeak() };
  }
  const inProcess = await collectInProcessJobs(env, options.workspaceRoot);
  if (inProcess.length > 0 && args.confirm !== true) {
    return {
      needsConfirm: true,
      asleep: true,
      inProcess: inProcess.map((row) => ({
        jobId: row.job.id,
        title: row.job.title,
      })),
      message: wakeConfirmSpeak(inProcess.map((row) => row.job)),
    };
  }
  const slept = await wakePrism(env);
  let resumed = 0;
  const drainRoots = new Set<string>();
  for (const row of slept) {
    if (await requeueSleptJob(row.workspaceRoot, row.jobId)) {
      resumed += 1;
      drainRoots.add(row.workspaceRoot);
    }
  }
  drainRoots.add(options.workspaceRoot);
  for (const root of drainRoots) {
    await kickDrainIfAwake(options, env, context, root);
  }
  return {
    asleep: false,
    resumed,
    message: wakeSpeak(resumed),
  };
}

async function useSkillTool(
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  const name = String(args.name ?? args.skill ?? "").trim();
  if (!name) {
    const listed = await listSkills(env);
    return {
      skills: listed.map((skill) => ({
        name: skill.name,
        description: skill.description,
        inherited: skill.inherited,
        status: skill.status,
      })),
      message:
        listed.length === 0
          ? "No Prism skills yet."
          : listed
              .map((skill) =>
                skill.description
                  ? `${skill.name} — ${skill.description}`
                  : skill.name,
              )
              .join("\n"),
    };
  }
  const skill = await readSkill(name, env);
  if (!skill) {
    return {
      message: `No skill named ${name}. Say prism use to list them.`,
    };
  }
  return {
    name: skill.name,
    description: skill.description,
    inherited: skill.inherited,
    status: skill.status,
    message: skillSpeak(skill),
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
      message: formatConfig(config),
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
    jobInstructions: patch.jobInstructions,
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
  const message = [formatConfig(config), ...preferenceNotes]
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
    config.jobInstructions.trim()
      ? `jobInstructions: ${config.jobInstructions.trim()}`
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
  if (!creds.ready) return { ready: false, message: creds.message };

  // Sign-in was the thing every auth-blocked job was waiting for, so put them
  // back in the queue rather than making the user say "resume" once per job
  // (ADR-0047).
  const requeued = await requeueAuthBlocked(options.workspaceRoot);
  if (requeued.length > 0) {
    await kickDrainIfAwake(options, env, context);
  }

  const resumedNote =
    requeued.length === 0
      ? ""
      : requeued.length === 1
        ? ` ${jobRef(requeued[0]!)} is back in the queue and will start on its own.`
        : ` ${requeued.length} waiting jobs are back in the queue and will start on their own.`;

  return {
    ready: true,
    requeued: requeued.length,
    message: `${initSpeak(true, creds.email)}${resumedNote}`,
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
  // An env key is enough to start. Do not load the Cursor SDK just to
  // inspect stored login — that import hangs tests and slows drain.
  if (env.CURSOR_API_KEY?.trim()) {
    return inspectCursorWorkerAuth(env, undefined);
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
  const sdk =
    backend === "cursor" && process.env.VITEST !== "true"
      ? await loadCursorSdk()
      : undefined;
  const config = await loadConfig(options.workspaceRoot);
  const jobs = await reapJobs(options.workspaceRoot);
  const hosts = await discoverHostConnectors({
    workspaceRoot: options.workspaceRoot,
  });
  const creds = await resolveWorkerAuth(options, env, undefined, { backend });
  const diskMessage = await diskBudgetMessage(options.workspaceRoot);
  const ramMessage = ramGate(options);
  const asleep = await isPrismAsleep(env);
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
      id: "sleep",
      ok: !asleep,
      detail: asleep ? "asleep — say prism wake" : "awake",
    },
    {
      // Replaces the Prism Auth reachability check (ADR-0049). Prism no longer
      // runs connectors, so what matters is whether the *host* has any: that
      // is what decides how much of a standup can be filled.
      id: "host_connectors",
      ok: hosts.connectors.length > 0,
      detail:
        hosts.connectors.length > 0
          ? `${hosts.connectors.map((row) => row.label).join(", ")} available in your agent window`
          : "No connectors found in Cursor or Claude Code — standups will cover this repo only.",
    },
  ];
  return {
    checks,
    message: doctorSpeak(checks),
  };
}

export type { GitRunner };
