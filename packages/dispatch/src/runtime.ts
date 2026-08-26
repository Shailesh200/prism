import { randomUUID } from "node:crypto";
import { buildDayBriefing, type BriefingDeps } from "./briefing.js";
import { grantPurpose, isPurposeGranted, revokePurpose } from "./consent.js";
import { loadConfig, saveConfig } from "./config.js";
import { DRIVER_LABELS } from "./drivers.js";
import { exportSettings } from "./export-settings.js";
import { gitStatusShort, type GitRunner } from "./git.js";
import { allocateJobId, displayJobId, resolveJobRef } from "./job-id.js";
import {
  agentNameForJob,
  alreadyRunningSpeak,
  ambiguousJobSpeak,
  controlSpeak,
  doctorSpeak,
  initSpeak,
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
import { isProcessAlive, reapJobs } from "./run-state.js";
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
  type CursorAuthInspect,
  type CursorAuthPort,
} from "./cursor-auth.js";
import { adoptOrCreateWorktree } from "./worktrees.js";
import { diskBudgetMessage, ramBudgetMessage } from "./worker-budget.js";
import { linkWorktreeInstall } from "./worktree-install.js";

export const DISPATCH_TOOL_NAMES = [
  "start_my_day",
  "init",
  "start_job",
  "list_jobs",
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
  readonly startOAuth?: (driver: DriverId) => Promise<unknown>;
  readonly fetchImpl?: typeof fetch;
  readonly oauthUi?: OAuthUiPort;
  /** Injected in tests. Production uses Cursor.auth (SDK store), not mcp.json. */
  readonly cursorAuth?: CursorAuthPort;
  /** Injected in tests. Production reads `os.freemem()`. */
  readonly freeMemoryBytes?: number;
};

function ramGate(options: DispatchRuntimeOptions): string | undefined {
  if (options.freeMemoryBytes == null && process.env.VITEST) return undefined;
  return ramBudgetMessage(options.freeMemoryBytes);
}

export function createDispatchRuntime(
  options: DispatchRuntimeOptions,
): DispatchRuntime {
  const env = options.env ?? process.env;
  return {
    workspaceRoot: options.workspaceRoot,
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
          return buildDayBriefing(options);
        case "init":
          return initTool(options, env, context);
        case "start_job":
          return startJob(options, args, env, context);
        case "list_jobs":
          return listJobs(options);
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
  const jobs = await reapJobs(options.workspaceRoot);
  const id = jobIdFrom(
    title,
    new Set(jobs.map((job) => job.id)),
    args.jobId ?? args.id,
  );
  const existing = jobs.find((job) => job.id === id);
  if (
    existing &&
    (existing.status === "running" || existing.status === "booting") &&
    isProcessAlive(existing.workerPid)
  ) {
    return {
      job: existing,
      message: alreadyRunningSpeak(existing),
    };
  }
  if (activeJobCount(jobs) >= config.maxJobs) {
    return {
      message: `At the job cap (${config.maxJobs}). Finish or cancel one, or raise maxJobs with configure.`,
      maxJobs: config.maxJobs,
    };
  }
  const tree = existing
    ? {
        path: existing.worktreePath,
        branch: existing.branch,
        source: existing.source,
        cursorAgentId: existing.cursorAgentId,
        claudeSession: existing.claudeSession,
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
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(tree.cursorAgentId ? { cursorAgentId: tree.cursorAgentId } : {}),
    ...(tree.claudeSession ? { claudeSession: tree.claudeSession } : {}),
  };
  job = await upsertJob(options.workspaceRoot, job);

  const creds = await resolveWorkerAuth(options, env, context, {
    login: true,
  });
  if (!creds.ready) {
    job = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "blocked",
      waitingOn: "cursor-auth",
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
  const worker = options.worker;
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
      prompt: workerPrompt({ job, memories }),
      mcpCommand: launch.command,
      mcpArgs: launch.args,
      workspaceRoot: options.workspaceRoot,
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
      message: startJobSpeak(job),
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

async function listJobs(options: DispatchRuntimeOptions): Promise<unknown> {
  const jobs = await reapJobs(options.workspaceRoot);
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
    });
  }
  return {
    jobs: rows,
    message: listJobsSpeak(rows),
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

  if (action === "cancel" || action === "pause") {
    if (options.worker) {
      await options.worker.cancel({
        ...(job.cursorAgentId ? { agentId: job.cursorAgentId } : {}),
        cwd: job.worktreePath,
        jobId: job.id,
        workspaceRoot: options.workspaceRoot,
        ...(typeof job.workerPid === "number" ? { pid: job.workerPid } : {}),
      });
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

  if (action === "resume" || action === "attach_context") {
    const extra = String(args.context ?? args.text ?? "").trim();
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
      return { job, message: alreadyRunningSpeak(job) };
    }
    const creds = await resolveWorkerAuth(options, env, context, {
      login: true,
    });
    if (!creds.ready) {
      return { message: creds.message, job };
    }
    if (!options.worker) {
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
    const memories = await loadMemories(options.workspaceRoot);
    const combinedExtra = [job.pendingContext, extra]
      .filter(Boolean)
      .join("\n\n");
    let pid: number | undefined;
    let agentId = job.cursorAgentId;
    if (job.cursorAgentId) {
      const resumed = await options.worker.resume({
        jobId: job.id,
        agentId: job.cursorAgentId,
        cwd: job.worktreePath,
        name: agentNameForJob(job),
        ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
        prompt:
          action === "attach_context"
            ? combinedExtra || "Continue."
            : workerPrompt({ job, memories, extra: combinedExtra }),
        mcpCommand: launch.command,
        mcpArgs: launch.args,
        workspaceRoot: options.workspaceRoot,
      });
      if (resumed && typeof resumed.pid === "number") pid = resumed.pid;
    } else {
      const started = await options.worker.start({
        jobId: job.id,
        cwd: job.worktreePath,
        name: agentNameForJob(job),
        ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
        prompt: workerPrompt({ job, memories, extra: combinedExtra }),
        mcpCommand: launch.command,
        mcpArgs: launch.args,
        workspaceRoot: options.workspaceRoot,
      });
      agentId = started.agentId ?? agentId;
      if (typeof started.pid === "number") pid = started.pid;
    }
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
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

  return {
    message:
      "job_control action must be pause, resume, cancel, or attach_context.",
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
            return `${row.label}: not connected (Prism Auth unreachable)`;
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
    return {
      broker,
      reachable: false,
      message: `Prism Auth (${broker}) is unreachable. Try “connect ${DRIVER_LABELS[driver]}” again in a moment. You do not create an OAuth app.`,
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
      message: formatConfig(config),
    };
  }
  const patchRaw = args.patch ?? args.config ?? args;
  const patch =
    patchRaw && typeof patchRaw === "object"
      ? (patchRaw as Record<string, unknown>)
      : {};
  const allowed: Partial<DispatchConfig> = {};
  const parsed = DispatchConfigSchema.partial().safeParse({
    sectionOrder: patch.sectionOrder,
    sectionsOff: patch.sectionsOff,
    standupTemplate: patch.standupTemplate,
    hints: patch.hints,
    maxJobs: patch.maxJobs,
    ticketHost: patch.ticketHost,
    mentionWindowHours: patch.mentionWindowHours,
    mentionLimit: patch.mentionLimit,
    trackedMessageLimit: patch.trackedMessageLimit,
    slackTrackChannelIds: patch.slackTrackChannelIds,
  });
  if (!parsed.success) {
    return { message: `Invalid configure patch: ${parsed.error.message}` };
  }
  Object.assign(allowed, parsed.data);
  const config = await saveConfig(workspaceRoot, allowed);
  return { config, message: formatConfig(config) };
}

function formatConfig(config: DispatchConfig): string {
  return [
    `hints=${config.hints}`,
    `maxJobs=${config.maxJobs}`,
    `ticketHost=${config.ticketHost}`,
    `slack channels=${config.slackTrackChannelIds.join(",") || "(none)"}`,
    `mention window=${config.mentionWindowHours}h cap=${config.mentionLimit}`,
  ].join(" · ");
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

async function resolveWorkerAuth(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
  context?: DispatchToolContext,
  flags: { readonly login?: boolean } = {},
): Promise<CursorAuthInspect> {
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
  const sdk = await loadCursorSdk();
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
  const creds = await resolveWorkerAuth(options, env);
  const diskMessage = await diskBudgetMessage(options.workspaceRoot);
  const ramMessage = ramGate(options);
  const checks = [
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
      detail: sdk ? "importable" : "Cursor SDK did not load — reload prism MCP",
    },
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
        : `${broker} unreachable — connect will wait until Prism Auth is up`,
    },
  ];
  return {
    checks,
    message: doctorSpeak(checks),
  };
}

export type { GitRunner };
