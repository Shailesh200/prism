import { randomUUID } from "node:crypto";
import { buildDayBriefing, type BriefingDeps } from "./briefing.js";
import { grantPurpose, isPurposeGranted, revokePurpose } from "./consent.js";
import { loadConfig, saveConfig } from "./config.js";
import { DRIVER_LABELS } from "./drivers.js";
import { exportSettings } from "./export-settings.js";
import { gitStatusShort, type GitRunner } from "./git.js";
import { activeJobCount, getJob, loadJobs, upsertJob } from "./jobs.js";
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
import { adoptOrCreateWorktree } from "./worktrees.js";

export const DISPATCH_TOOL_NAMES = [
  "start_my_day",
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
};

export function createDispatchRuntime(
  options: DispatchRuntimeOptions,
): DispatchRuntime {
  const env = options.env ?? process.env;
  return {
    workspaceRoot: options.workspaceRoot,
    async handle(name, args, context) {
      if (
        isWorkerRole(env) &&
        (name === "start_my_day" || name === "start_job")
      ) {
        return {
          message:
            "This Prism process is a Dispatch worker. It cannot start jobs or standups.",
        };
      }
      switch (name) {
        case "start_my_day":
          return buildDayBriefing(options);
        case "start_job":
          return startJob(options, args, env);
        case "list_jobs":
          return listJobs(options);
        case "job_control":
          return jobControl(options, args, env);
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

function jobIdFrom(title: string, explicit?: unknown): string {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const ticket = title.match(/\b([A-Z]{2,}-\d+)\b/);
  if (ticket?.[1]) return ticket[1];
  return `job-${randomUUID().slice(0, 8)}`;
}

async function startJob(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  const title = String(args.title ?? args.ticket ?? "").trim();
  const prd = String(args.prd ?? args.brief ?? "").trim();
  if (!title) {
    return { message: "start_job needs a title (and a PRD helps)." };
  }
  const config = await loadConfig(options.workspaceRoot);
  const jobs = await loadJobs(options.workspaceRoot);
  if (activeJobCount(jobs) >= config.maxJobs) {
    return {
      message: `At the job cap (${config.maxJobs}). Finish or cancel one, or raise maxJobs with configure.`,
      maxJobs: config.maxJobs,
    };
  }

  const id = jobIdFrom(title, args.jobId ?? args.id);
  const existing = jobs.find((job) => job.id === id);
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
      message: `Job ${overlap.existingJobId} already uses ${overlap.path}${overlap.dirty ? " (dirty)" : ""}. Call start_job again with confirmOverlap=true if you still want a second agent there.`,
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

  const apiKey = env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    job = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "blocked",
      waitingOn: "CURSOR_API_KEY",
      nextStep:
        "Set CURSOR_API_KEY on the Prism MCP server, then job_control resume.",
    });
    return {
      job,
      message: `Job ${job.id} is recorded at ${job.worktreePath} (source: ${job.source}). Set CURSOR_API_KEY to start the local Cursor worker. Briefing, connect, and remember still work without it.`,
    };
  }

  const memories = await loadMemories(options.workspaceRoot);
  const launch = resolveMcpLaunch(env);
  const worker = options.worker;
  if (!worker) {
    return {
      job,
      message: `Job ${job.id} is ready at ${job.worktreePath}, but no worker is configured.`,
    };
  }

  job = await upsertJob(options.workspaceRoot, {
    ...job,
    status: "booting",
  });
  try {
    const started = await worker.start({
      cwd: job.worktreePath,
      apiKey,
      prompt: workerPrompt({ job, memories }),
      mcpCommand: launch.command,
      mcpArgs: launch.args,
      workspaceRoot: options.workspaceRoot,
    });
    job = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "running",
      cursorAgentId: started.agentId,
      nextStep: "worker running",
    });
    return {
      job,
      message: `Started ${job.id} in ${job.worktreePath} (${job.source} worktree). Agent ${started.agentId} is running; this call does not wait for it to finish.`,
    };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    job = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "blocked",
      waitingOn: "worker",
      nextStep: detail,
    });
    return {
      job,
      message: `Job ${job.id} is recorded at ${job.worktreePath}, but the worker did not start: ${detail}`,
    };
  }
}

async function listJobs(options: DispatchRuntimeOptions): Promise<unknown> {
  const jobs = await loadJobs(options.workspaceRoot);
  const rows = [];
  for (const job of jobs) {
    const git = await gitStatusShort(job.worktreePath, options.git);
    let agent = { status: "n/a", detail: "" };
    if (job.cursorAgentId && options.worker && options.env?.CURSOR_API_KEY) {
      agent = await options.worker.status({
        agentId: job.cursorAgentId,
        cwd: job.worktreePath,
        apiKey: options.env.CURSOR_API_KEY,
      });
    }
    rows.push({
      ...job,
      gitStatus: git || "clean",
      agentStatus: agent.status,
      agentDetail: agent.detail,
    });
  }
  return {
    jobs: rows,
    message:
      rows.length === 0
        ? "No Dispatch jobs yet. Say “start working on …” with a ticket and PRD."
        : rows
            .map(
              (job) =>
                `${job.id} · ${job.status} · ${job.title} · ${job.worktreePath} · git ${job.gitStatus.split("\n")[0] || "clean"}`,
            )
            .join("\n"),
  };
}

async function jobControl(
  options: DispatchRuntimeOptions,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  const id = String(args.jobId ?? args.id ?? "").trim();
  const action = String(args.action ?? "").trim();
  const job = await getJob(options.workspaceRoot, id);
  if (!job) return { message: `No job named ${id || "(missing id)"}.` };
  const apiKey = env.CURSOR_API_KEY?.trim();
  const launch = resolveMcpLaunch(env);

  if (action === "cancel" || action === "pause") {
    if (job.cursorAgentId && options.worker && apiKey) {
      await options.worker.cancel({
        agentId: job.cursorAgentId,
        cwd: job.worktreePath,
        apiKey,
      });
    }
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      status: action === "cancel" ? "cancelled" : "paused",
      nextStep: action === "cancel" ? "" : "paused — say resume to continue",
    });
    return { job: next, message: `${action}d ${next.id}.` };
  }

  if (action === "resume" || action === "attach_context") {
    if (!apiKey) {
      return { message: "Set CURSOR_API_KEY first.", job };
    }
    if (!options.worker) {
      return { message: "No worker configured.", job };
    }
    const memories = await loadMemories(options.workspaceRoot);
    const extra = String(args.context ?? args.text ?? "").trim();
    if (job.cursorAgentId) {
      await options.worker.resume({
        agentId: job.cursorAgentId,
        cwd: job.worktreePath,
        apiKey,
        prompt:
          action === "attach_context"
            ? extra || "Continue."
            : workerPrompt({ job, memories, extra }),
        mcpCommand: launch.command,
        mcpArgs: launch.args,
        workspaceRoot: options.workspaceRoot,
      });
    } else {
      const started = await options.worker.start({
        cwd: job.worktreePath,
        apiKey,
        prompt: workerPrompt({ job, memories, extra }),
        mcpCommand: launch.command,
        mcpArgs: launch.args,
        workspaceRoot: options.workspaceRoot,
      });
      await upsertJob(options.workspaceRoot, {
        ...job,
        cursorAgentId: started.agentId,
        status: "running",
      });
    }
    const next = await upsertJob(options.workspaceRoot, {
      ...job,
      status: "running",
      nextStep: "worker running",
    });
    return { job: next, message: `Resumed ${next.id}.` };
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

async function doctorTool(
  options: DispatchRuntimeOptions,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  const sdk = await loadCursorSdk();
  const config = await loadConfig(options.workspaceRoot);
  const jobs = await loadJobs(options.workspaceRoot);
  const broker = authBrokerUrl(env);
  const brokerCatalog = await listBrokerDrivers(
    broker,
    options.fetchImpl ?? fetch,
  );
  const enabledCount = brokerCatalog.drivers.filter(
    (row) => row.enabled,
  ).length;
  const checks = [
    {
      id: "cursor_api_key",
      ok: Boolean(env.CURSOR_API_KEY?.trim()),
      detail: env.CURSOR_API_KEY?.trim()
        ? "set"
        : "missing — briefing still works; start_job will wait",
    },
    {
      id: "cursor_sdk",
      ok: Boolean(sdk),
      detail: sdk ? "importable" : "@cursor/sdk not installed",
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
      id: "prism_auth",
      ok: brokerCatalog.reachable,
      detail: brokerCatalog.reachable
        ? `${broker} · ${enabledCount} connector(s) enabled`
        : `${broker} unreachable — connect will wait until Prism Auth is up`,
    },
  ];
  return {
    checks,
    message: checks
      .map(
        (check) => `${check.ok ? "ok" : "warn"} ${check.id}: ${check.detail}`,
      )
      .join("\n"),
  };
}

export type { GitRunner };
