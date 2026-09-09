import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { access } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createClaudeWorkerPort,
  createCursorWorkerPort,
  createDispatchRuntime,
  DispatchConfigSchema,
  discoverHostConnectors,
  vendorCoverage,
  drainWorkspace,
  loadConfig,
  listWorkerModels,
  requestedWorkerModel,
  resolveWorkerBackend,
  getJob,
  upsertJob,
  readRunLog,
  saveConfig,
  asleepPageHtml,
  isPrismAsleep,
  isPrismAsleepSync,
  listSkills,
  writeSkill,
  deleteSkill,
  duplicateSkill,
  type DispatchConfig,
  type WorkerBackend,
  type WorkerModelOption,
} from "@repo-prism/dispatch";
import { parseHostRequest } from "@repo-prism/host-session/protocol";
import {
  originAllowed,
  tokenFromRequest,
  tokensMatch,
  hubCookieHeader,
} from "./auth.js";
import { createIdleTimer, IDLE_MS } from "./idle.js";
import {
  createIntelligencePlane,
  type IntelligencePlane,
} from "./intelligence.js";
import {
  newHubToken,
  packageVersion,
  readHubRecord,
  writeHubRecord,
} from "./hub-record.js";
import { formatJobFinishedNotice } from "./notice.js";
import { listJobNotes, readJobNote } from "./notes.js";
import { createOsNotifier, type NotifyFn } from "./notify.js";
import { readHostTelemetry } from "./host-telemetry.js";
import { dashboardUrl, hubPort, type HubEnv } from "./paths.js";
import {
  PLAYGROUND_PORT,
  effectivePlaygroundPort,
  playgroundIsLive,
  playgroundUrl,
  playgroundViteEnabled,
  resolvePlaygroundApp,
  spawnPlaygroundVite,
  stopPlaygroundListeners,
  waitForPlaygroundLive,
  writePlaygroundRecord,
} from "./playground.js";
import { collectRepoTrees, runTreeAction } from "./trees.js";
import { mcpUpdateStatus, applyMcpUpdate } from "./update.js";
import { HUB_ERROR, publicCaughtError } from "./api-errors.js";
import { pickLocalFolder } from "./pick-folder.js";
import {
  dropMissingWorkspaces,
  registerWorkspace,
  unregisterWorkspace,
  workspaceLabel,
} from "./registry.js";
import type {
  HubEvent,
  HubRecord,
  JobSnapshot,
  WorkspaceEntry,
  WorkspaceError,
} from "./types.js";
import {
  collectJobs,
  isInFlight,
  pathExists,
  watchWorkspaces,
} from "./watch.js";
import { toSnapshot } from "./snapshot.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".map": "application/json",
};

export type JobControlFn = (
  workspacePath: string,
  jobId: string,
  action: string,
  extra?: { readonly path?: string; readonly context?: string },
) => Promise<unknown>;

export type JobStartFn = (
  workspacePath: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export type HubOptions = {
  readonly env?: HubEnv;
  readonly notify?: NotifyFn;
  readonly idleMs?: number;
  readonly pollMs?: number;
  readonly assetsDir?: string;
  readonly control?: JobControlFn;
  readonly startJob?: JobStartFn;
  readonly version?: string;
  /** Injected in tests; production drains through `@repo-prism/dispatch`. */
  readonly drain?: (workspacePath: string) => Promise<void>;
  /** Injected in tests; production lazily imports Core (ADR-0048). */
  readonly intelligence?: IntelligencePlane;
  /** Injected in tests; production opens the native folder picker. */
  readonly pickFolder?: () => Promise<string | undefined>;
  /** Injected in tests; production asks the selected agent for its model list. */
  readonly listWorkerModels?: (input: {
    readonly backend: WorkerBackend;
  }) => Promise<readonly WorkerModelOption[]>;
  /** Injected in tests. Production starts `apps/playground` with bun. */
  readonly spawnPlayground?: (
    workspaceRoot: string,
  ) => Promise<{ pid: number } | undefined>;
};

export type StartedHub = {
  readonly record: HubRecord;
  readonly url: string;
  readonly close: () => Promise<void>;
};

type SseClient = {
  readonly res: ServerResponse;
};

function defaultAssetsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "dashboard");
}

async function defaultStartJob(
  workspacePath: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const runtime = createDispatchRuntime({
    workspaceRoot: workspacePath,
    worker: createCursorWorkerPort(),
    claudeWorker: createClaudeWorkerPort(),
    getClientName: () => String(args.hostClient ?? "console"),
  });
  return runtime.handle("start_job", {
    ...args,
    hostClient: args.hostClient ?? "console",
  });
}

async function defaultControl(
  workspacePath: string,
  jobId: string,
  action: string,
  extra?: { readonly path?: string; readonly context?: string },
): Promise<unknown> {
  const runtime = createDispatchRuntime({
    workspaceRoot: workspacePath,
    worker: createCursorWorkerPort(),
    claudeWorker: createClaudeWorkerPort(),
    getClientName: () => "console",
    ...(action === "reverify" ? { deferVerify: true } : {}),
  });
  return runtime.handle("job_control", {
    jobId,
    action,
    ...(extra?.path ? { path: extra.path } : {}),
    ...(extra?.context ? { context: extra.context } : {}),
  });
}

/**
 * Advance one workspace's job queue (ADR-0047).
 *
 * The hub is the only always-on process on the machine, which makes it the
 * right owner of the drain: a job queued by an MCP server that has since
 * exited still starts, and a job parked behind the cap starts as soon as a
 * slot frees.
 */
async function defaultDrain(
  workspacePath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const cursor = createCursorWorkerPort();
  const claude = createClaudeWorkerPort();
  const runtime = createDispatchRuntime({
    workspaceRoot: workspacePath,
    worker: cursor,
    claudeWorker: claude,
    env,
  });
  await drainWorkspace(runtime.drainDeps());
}

export async function startHub(
  options: HubOptions = {},
): Promise<StartedHub | { alreadyRunning: true }> {
  const env = options.env ?? process.env;
  const notify = options.notify ?? createOsNotifier();
  const assetsDir = options.assetsDir ?? defaultAssetsDir();
  const control = options.control ?? defaultControl;
  const startJob = options.startJob ?? defaultStartJob;
  const version = options.version ?? packageVersion();
  const intelligence = options.intelligence ?? createIntelligencePlane();
  const pickFolder = options.pickFolder ?? pickLocalFolder;
  const listModels =
    options.listWorkerModels ??
    ((input: { readonly backend: WorkerBackend }) =>
      listWorkerModels({ backend: input.backend }));
  const previous = await readHubRecord(env);
  const token =
    typeof previous?.token === "string" && previous.token.length >= 16
      ? previous.token
      : newHubToken();
  const wantedPort = hubPort(env);

  let workspaces: WorkspaceEntry[] = await dropMissingWorkspaces(
    pathExists,
    env,
  );
  const sse = new Set<SseClient>();
  let jobs: JobSnapshot[] = [];
  // Mirrored from the watcher so every payload can state when it was read and
  // which workspaces failed, rather than presenting a partial list as whole.
  let asOf = new Date().toISOString();
  let workspaceErrors: WorkspaceError[] = [];
  let server: Server | undefined;
  let playgroundHttp: Server | undefined;
  let playgroundBoundPort = 0;
  let playgroundPid: number | undefined;
  let closed = false;
  let liveRecord: HubRecord = {
    port: wantedPort,
    pid: process.pid,
    version,
    token,
    startedAt: new Date().toISOString(),
  };

  const broadcast = (event: HubEvent): void => {
    if (event.type === "snapshot") {
      jobs = [...event.jobs];
      asOf = event.asOf;
      workspaceErrors = [...event.errors];
    }
    if (event.type === "job.updated") {
      jobs = [
        ...jobs.filter(
          (row) =>
            !(
              row.id === event.job.id &&
              row.workspacePath === event.job.workspacePath
            ),
        ),
        event.job,
      ];
    }
    if (event.type === "job.removed") {
      jobs = jobs.filter(
        (row) =>
          !(
            row.id === event.job.id &&
            row.workspacePath === event.job.workspacePath
          ),
      );
    }
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sse) {
      try {
        client.res.write(payload);
      } catch {
        sse.delete(client);
      }
    }
  };

  const onEvent = (event: HubEvent): void => {
    broadcast(event);
    if (event.type === "job.finished") {
      void notify(
        formatJobFinishedNotice(event.job),
        dashboardUrl(liveRecord.port, liveRecord.token),
      );
    }
    idle.touch();
  };

  const wantedPlaygroundPort = effectivePlaygroundPort(env);
  const spawnPlayground =
    options.spawnPlayground ??
    (async (workspaceRoot: string) =>
      playgroundViteEnabled(env)
        ? spawnPlaygroundVite({
            workspaceRoot,
            extraRoots: workspaces.map((row) => row.path),
            env,
            port: wantedPlaygroundPort || PLAYGROUND_PORT,
          })
        : undefined);

  const stopPlaygroundPort = async (): Promise<void> => {
    if (playgroundHttp) {
      const current = playgroundHttp;
      playgroundHttp = undefined;
      await new Promise<void>((resolve) => {
        current.close(() => resolve());
        try {
          current.closeAllConnections();
        } catch {
          /* bun / older node */
        }
      });
    }
    playgroundBoundPort = 0;
  };

  const parkPlaygroundPort = async (): Promise<{
    port: number;
    url: string;
  }> => {
    await stopPlaygroundPort();
    await stopPlaygroundListeners(
      wantedPlaygroundPort || PLAYGROUND_PORT,
      playgroundPid,
    );
    playgroundPid = undefined;
    await new Promise((resolve) => {
      setTimeout(resolve, 50).unref?.();
    });
    const html = asleepPageHtml();
    const bound = await new Promise<{ server: Server; port: number }>(
      (resolve, reject) => {
        const srv = createServer((req, res) => {
          if (!originAllowed(req.headers.origin)) {
            json(res, 403, { error: HUB_ERROR.origin });
            return;
          }
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(html);
        });
        srv.once("error", (error: NodeJS.ErrnoException) => {
          reject(error);
        });
        srv.listen(wantedPlaygroundPort, "127.0.0.1", () => {
          const address = srv.address();
          const port =
            address && typeof address === "object"
              ? address.port
              : wantedPlaygroundPort;
          resolve({ server: srv, port });
        });
      },
    );
    playgroundHttp = bound.server;
    playgroundBoundPort = bound.port;
    await writePlaygroundRecord(env, {
      port: bound.port,
      mode: "asleep",
    });
    return { port: bound.port, url: playgroundUrl(bound.port) };
  };

  const wakePlaygroundPort = async (
    workspaceRoot: string,
  ): Promise<{
    ok: boolean;
    port: number;
    url: string;
    detail: string;
  }> => {
    await stopPlaygroundPort();
    const port = wantedPlaygroundPort || PLAYGROUND_PORT;
    const url = playgroundUrl(port);
    if (await playgroundIsLive(port)) {
      await writePlaygroundRecord(env, { port, mode: "vite" });
      return { ok: true, port, url, detail: "Playground is up." };
    }
    const extraRoots = workspaces.map((row) => row.path);
    const app = await resolvePlaygroundApp(workspaceRoot, extraRoots, env);
    if (!app) {
      return {
        ok: false,
        port,
        url,
        detail: "This repo has no playground app.",
      };
    }
    const spawned = await spawnPlayground(workspaceRoot);
    playgroundPid = spawned?.pid;
    const live = await waitForPlaygroundLive(port);
    if (live) {
      await writePlaygroundRecord(env, {
        port,
        mode: "vite",
        ...(typeof playgroundPid === "number" ? { pid: playgroundPid } : {}),
      });
      return { ok: true, port, url, detail: "Playground is up." };
    }
    return {
      ok: Boolean(spawned),
      port,
      url,
      detail: spawned ? "Playground is starting." : "Playground did not start.",
    };
  };

  // The hub tick is the queue's safety net (ADR-0047). `start_job` kicks its
  // own drain, but that kick dies with the MCP process; this catches anything
  // left `queued`, and re-checks jobs parked behind the concurrency cap.
  const watcher = watchWorkspaces(() => workspaces, onEvent, {
    pollMs: options.pollMs,
    drain: options.drain ?? ((workspace) => defaultDrain(workspace, env)),
  });

  const idle = createIdleTimer({
    idleMs: options.idleMs ?? IDLE_MS,
    shouldExit: () =>
      !isPrismAsleepSync(env) && sse.size === 0 && !jobs.some(isInFlight),
    onIdle: () => {
      void close();
    },
  });

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    idle.stop();
    watcher.close();
    intelligence.close();
    for (const client of sse) {
      try {
        client.res.end();
      } catch {
        /* ignore */
      }
    }
    sse.clear();
    await stopPlaygroundPort();
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, 1_000);
      timer.unref();
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
      try {
        server.closeAllConnections();
      } catch {
        /* bun / older node */
      }
    });
  };

  server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  const listen = await new Promise<
    { ok: true; port: number } | { ok: false; code: string }
  >((resolve) => {
    server!.once("error", (error: NodeJS.ErrnoException) => {
      resolve({ ok: false, code: error.code ?? "ERROR" });
    });
    server!.listen(wantedPort, "127.0.0.1", () => {
      const address = server!.address();
      const port =
        address && typeof address === "object" ? address.port : wantedPort;
      resolve({ ok: true, port });
    });
  });

  if (!listen.ok) {
    watcher.close();
    idle.stop();
    if (listen.code === "EADDRINUSE") {
      return { alreadyRunning: true };
    }
    throw new Error(`prism-hub: listen failed (${listen.code})`);
  }

  liveRecord = { ...liveRecord, port: listen.port };
  await writeHubRecord(liveRecord, env);
  if (process.env.VITEST !== "true") {
    void listModels({ backend: "cursor" }).catch(() => {
      /* spawn still lists if this misses */
    });
  }
  const initial = await collectJobs(workspaces);
  broadcast({
    type: "snapshot",
    jobs: initial.jobs,
    asOf: new Date().toISOString(),
    errors: initial.errors,
  });

  if (await isPrismAsleep(env)) {
    await parkPlaygroundPort().catch(() => undefined);
  }

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const host = req.headers.host ?? `127.0.0.1:${liveRecord.port}`;
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (!originAllowed(req.headers.origin)) {
      json(res, 403, { error: HUB_ERROR.origin });
      return;
    }

    const asleep = await isPrismAsleep(env);

    if (url.pathname === "/api/healthz") {
      json(res, 200, {
        ok: true,
        port: liveRecord.port,
        pid: process.pid,
        version,
        workspaces: workspaces.length,
        asleep,
        playground: {
          port: playgroundBoundPort || wantedPlaygroundPort || PLAYGROUND_PORT,
          url: playgroundUrl(
            playgroundBoundPort || wantedPlaygroundPort || PLAYGROUND_PORT,
          ),
        },
        // Whether the Intelligence plane has actually loaded Core, and on
        // what. A reader can tell an idle Console from a busy one.
        intelligence: {
          loaded: intelligence.loaded(),
          workspace: intelligence.openWorkspace() ?? null,
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/playground") {
      if (!tokensMatch(liveRecord.token, tokenFromRequest(req, url))) {
        json(res, 401, { error: HUB_ERROR.unauthorized });
        return;
      }
      const body = await readBody(req);
      const action = String(body.action ?? "").trim();
      const workspace =
        String(body.workspace ?? "").trim() || workspaces[0]?.path || "";
      try {
        if (action === "sleep") {
          const parked = await parkPlaygroundPort();
          json(res, 200, {
            ok: true,
            ...parked,
            detail: "Playground is down.",
          });
          return;
        }
        if (action === "wake") {
          const woken = await wakePlaygroundPort(workspace);
          json(res, woken.ok ? 200 : 503, woken);
          return;
        }
        json(res, 400, { error: HUB_ERROR.actionRequired });
      } catch (cause) {
        json(res, 500, { error: publicCaughtError(cause) });
      }
      return;
    }

    if (asleep) {
      if (
        req.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/index.html")
      ) {
        const headers: Record<string, string> = {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        };
        if (tokensMatch(liveRecord.token, tokenFromRequest(req, url))) {
          headers["Set-Cookie"] = hubCookieHeader(liveRecord.token);
        }
        res.writeHead(200, headers);
        res.end(asleepPageHtml());
        return;
      }
      json(res, 503, {
        error: "asleep",
        message: "Prism is down. Say prism wake.",
      });
      return;
    }

    const isApi = url.pathname.startsWith("/api/");
    if (isApi && !tokensMatch(liveRecord.token, tokenFromRequest(req, url))) {
      json(res, 401, { error: HUB_ERROR.unauthorized });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/telemetry/host") {
      json(
        res,
        200,
        await readHostTelemetry(workspaces[0]?.path ?? process.cwd()),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/worker-models") {
      const requested = url.searchParams.get("backend")?.trim();
      const workspace =
        url.searchParams.get("workspace")?.trim() || workspaces[0]?.path;
      let backend: WorkerBackend;
      if (requested === "cursor" || requested === "claude") {
        backend = requested;
      } else {
        const config = workspace
          ? await loadConfig(workspace).catch(() => undefined)
          : undefined;
        backend = resolveWorkerBackend({ config, env });
      }
      json(res, 200, {
        backend,
        models: await listModels({ backend }),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs") {
      const body = await readBody(req);
      const workspace =
        String(body.workspace ?? "").trim() || workspaces[0]?.path || "";
      const title = String(body.title ?? "").trim();
      if (!workspace || !title) {
        json(res, 400, { error: HUB_ERROR.titleRequired });
        return;
      }
      try {
        const workerModel = requestedWorkerModel(
          body.workerModel ?? body.model,
        );
        const origin =
          body.origin === "retry" ||
          body.origin === "reverify" ||
          body.origin === "finding" ||
          body.origin === "instruct"
            ? body.origin
            : undefined;
        const parentJobId = String(body.parentJobId ?? "").trim();
        const result = await startJob(workspace, {
          title,
          prd: String(body.prd ?? ""),
          playbook: String(body.playbook ?? "console"),
          ...(body.placement === "worktree" || body.placement === "checkout"
            ? { placement: body.placement }
            : {}),
          ...(typeof body.branch === "string" && body.branch.trim()
            ? { branch: String(body.branch).trim() }
            : {}),
          ...(typeof body.worktreePath === "string" &&
          body.worktreePath.trim()
            ? { worktreePath: String(body.worktreePath).trim() }
            : {}),
          ...(body.workerBackend === "cursor" || body.workerBackend === "claude"
            ? { workerBackend: body.workerBackend }
            : {}),
          ...(workerModel ? { workerModel } : {}),
          ...(parentJobId ? { parentJobId } : {}),
          ...(origin ? { origin } : {}),
          hostClient: "console",
        });
        await watcher.refresh({ drain: true });
        json(res, 200, result ?? { ok: true });
      } catch (cause) {
        json(res, 500, { error: publicCaughtError(cause) });
      }
      return;
    }

    const jobPatch = /^\/api\/jobs\/([^/]+)$/.exec(url.pathname);
    if (req.method === "PATCH" && jobPatch) {
      const jobId = decodeURIComponent(jobPatch[1] ?? "");
      const body = await readBody(req);
      const workspace =
        String(body.workspace ?? "").trim() ||
        jobs.find((job) => job.id === jobId)?.workspacePath ||
        "";
      if (!workspace || !jobId) {
        json(res, 400, { error: HUB_ERROR.workspaceJob });
        return;
      }
      if (!("prd" in body)) {
        json(res, 400, { error: HUB_ERROR.prdRequired });
        return;
      }
      try {
        const current = await getJob(workspace, jobId);
        if (!current) {
          json(res, 404, { error: HUB_ERROR.jobMissing });
          return;
        }
        const next = await upsertJob(workspace, {
          ...current,
          prd: String(body.prd ?? ""),
        });
        await watcher.refresh({ drain: false });
        json(res, 200, {
          job: toSnapshot(next, workspace),
          message: "Saved the brief.",
        });
      } catch (cause) {
        json(res, 500, { error: publicCaughtError(cause) });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/jobs") {
      json(res, 200, {
        jobs: [...watcher.jobs()],
        asOf: watcher.asOf(),
        errors: [...watcher.errors()],
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/trees") {
      const filter = url.searchParams.get("workspace")?.trim();
      const listed = filter
        ? workspaces.filter((entry) => entry.path === filter)
        : workspaces;
      const repos = await Promise.all(
        listed.map((entry) =>
          collectRepoTrees({
            workspacePath: entry.path,
            label: entry.label,
            jobs: jobs.filter((job) => job.workspacePath === entry.path),
          }),
        ),
      );
      json(res, 200, { repos });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/trees") {
      const body = await readBody(req);
      const workspace =
        String(body.workspace ?? "").trim() || workspaces[0]?.path || "";
      const treePath = String(body.treePath ?? "").trim();
      const action = String(body.action ?? "").trim();
      if (
        !workspace ||
        !treePath ||
        (action !== "merge" &&
          action !== "commit" &&
          action !== "push" &&
          action !== "remove")
      ) {
        json(res, 400, { error: HUB_ERROR.actionRequired });
        return;
      }
      try {
        const result = await runTreeAction({
          workspacePath: workspace,
          treePath,
          action,
          ...(String(body.branch ?? "").trim()
            ? { branch: String(body.branch).trim() }
            : {}),
          ...(String(body.jobId ?? "").trim()
            ? { jobId: String(body.jobId).trim() }
            : {}),
          ...(String(body.title ?? "").trim()
            ? { title: String(body.title).trim() }
            : {}),
        });
        json(res, result.ok ? 200 : 400, result);
      } catch (cause) {
        json(res, 500, { error: publicCaughtError(cause) });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/skills") {
      json(res, 200, { skills: await listSkills(env as NodeJS.ProcessEnv) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/skills") {
      const body = await readBody(req);
      const action = String(body.action ?? "save").trim();
      try {
        if (action === "delete") {
          const ok = await deleteSkill(
            String(body.name ?? ""),
            env as NodeJS.ProcessEnv,
          );
          json(res, ok ? 200 : 400, {
            ok,
            detail: ok ? "Deleted." : "Could not delete that skill.",
          });
          return;
        }
        if (action === "duplicate") {
          const copied = await duplicateSkill(
            String(body.name ?? ""),
            env as NodeJS.ProcessEnv,
          );
          if ("error" in copied) {
            json(res, 400, copied);
            return;
          }
          json(res, 200, copied);
          return;
        }
        const saved = await writeSkill(
          {
            name: String(body.name ?? ""),
            description: String(body.description ?? ""),
            body: String(body.body ?? ""),
            status: body.status === "published" ? "published" : "draft",
          },
          env as NodeJS.ProcessEnv,
        );
        if ("error" in saved) {
          json(res, 400, saved);
          return;
        }
        json(res, 200, saved);
      } catch (cause) {
        json(res, 500, { error: publicCaughtError(cause) });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/update") {
      if (process.env.VITEST === "true") {
        json(res, 200, {
          current: version,
          stale: false,
          localCheckout: true,
          hop: "current",
        });
        return;
      }
      json(res, 200, await mcpUpdateStatus(version));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/update") {
      if (process.env.VITEST === "true") {
        json(res, 200, {
          ok: true,
          current: version,
          cached: false,
          localCheckout: true,
          message: "Already on this build.",
        });
        return;
      }
      try {
        json(res, 200, await applyMcpUpdate(version));
      } catch (cause) {
        json(res, 500, { error: publicCaughtError(cause) });
      }
      return;
    }

    // The Repos plane needs to tell "no repositories registered" apart from
    // "registered, but no jobs" — two very different things the old board
    // rendered as one empty sentence (ADR-0048).
    if (req.method === "GET" && url.pathname === "/api/repos") {
      json(res, 200, {
        repos: workspaces.map((entry) => ({
          path: entry.path,
          label: entry.label,
          lastSeenAt: entry.lastSeenAt,
          jobCount: jobs.filter((job) => job.workspacePath === entry.path)
            .length,
          error: workspaceErrors.find((row) => row.workspacePath === entry.path)
            ?.detail,
        })),
        asOf,
      });
      return;
    }

    // What the user's agent window already has connected (ADR-0049). Served
    // from here rather than read directly by the IDE, so the extension keeps
    // its one dependency on Dispatch — HTTP — instead of importing it.
    if (req.method === "GET" && url.pathname === "/api/connectors") {
      const workspace =
        url.searchParams.get("workspace")?.trim() || workspaces[0]?.path;
      const discovery = await discoverHostConnectors(
        workspace ? { workspaceRoot: workspace } : {},
      );
      json(res, 200, {
        connectors: discovery.connectors,
        unreadable: discovery.unreadable,
        vendors: vendorCoverage(discovery.connectors),
        asOf: new Date().toISOString(),
      });
      return;
    }

    // Per-job console for the board's expander (M-066 P-P6).
    const logsMatch = /^\/api\/jobs\/([^/]+)\/logs$/.exec(url.pathname);
    if (req.method === "GET" && logsMatch) {
      const jobId = decodeURIComponent(logsMatch[1] ?? "");
      const workspace =
        url.searchParams.get("workspace") ??
        jobs.find((job) => job.id === jobId)?.workspacePath ??
        "";
      if (!workspace) {
        json(res, 400, { error: HUB_ERROR.workspaceRequired });
        return;
      }
      const since = url.searchParams.get("since")?.trim();
      const page = await readRunLog(workspace, jobId, {
        limit: Number(url.searchParams.get("limit") ?? "200") || 200,
        ...(since ? { since } : {}),
      });
      json(res, 200, page);
      return;
    }

    const notesMatch = /^\/api\/jobs\/([^/]+)\/notes$/.exec(url.pathname);
    if (req.method === "GET" && notesMatch) {
      const jobId = decodeURIComponent(notesMatch[1] ?? "");
      const job = jobs.find((row) => row.id === jobId);
      const workspace =
        url.searchParams.get("workspace") ?? job?.workspacePath ?? "";
      if (!workspace) {
        json(res, 400, { error: HUB_ERROR.workspaceRequired });
        return;
      }
      const rel = url.searchParams.get("path")?.trim();
      try {
        if (rel) {
          const file = await readJobNote({
            workspace,
            rel,
            ...(job?.worktreePath ? { worktreePath: job.worktreePath } : {}),
          });
          if (!file) {
            json(res, 404, { error: HUB_ERROR.noteMissing });
            return;
          }
          json(res, 200, file);
          return;
        }
        const listed = await listJobNotes({
          workspace,
          jobId,
          ...(job?.worktreePath ? { worktreePath: job.worktreePath } : {}),
          ...(job?.resultSummary ? { summary: job.resultSummary } : {}),
          ...(job?.notes ? { stored: job.notes } : {}),
        });
        json(res, 200, { notes: listed });
      } catch {
        json(res, 500, { error: HUB_ERROR.noteRead });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const client = { res };
      sse.add(client);
      idle.touch();
      res.write(
        `data: ${JSON.stringify({
          type: "snapshot",
          jobs: [...watcher.jobs()],
          asOf: watcher.asOf(),
          errors: [...watcher.errors()],
        })}\n\n`,
      );
      req.on("close", () => {
        sse.delete(client);
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/workspaces") {
      const body = await readBody(req);
      const path = String(body.path ?? "").trim();
      if (!path) {
        json(res, 400, { error: HUB_ERROR.pathRequired });
        return;
      }
      workspaces = await registerWorkspace(path, env);
      void watcher.refresh();
      json(res, 200, { workspaces });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/workspaces/remove") {
      const body = await readBody(req);
      const path = String(body.path ?? "").trim();
      if (!path) {
        json(res, 400, { error: HUB_ERROR.pathRequired });
        return;
      }
      const before = workspaces.length;
      workspaces = await unregisterWorkspace(path, env);
      if (workspaces.length === before) {
        json(res, 404, { error: "That repository is not registered." });
        return;
      }
      void watcher.refresh();
      json(res, 200, { workspaces });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/workspaces/pick") {
      const picked = await pickFolder();
      if (!picked) {
        json(res, 200, { cancelled: true });
        return;
      }
      workspaces = await registerWorkspace(picked, env);
      void watcher.refresh();
      json(res, 200, {
        path: picked,
        label: workspaceLabel(picked),
        workspaces,
      });
      return;
    }

    // The Intelligence plane (ADR-0048). Same `HostRequest`/`HostResponse`
    // contract the IDE webview already speaks, so `@repo-prism/app-shell`
    // mounts against it unchanged — but behind this Console's token and origin
    // allowlist, rather than the retired bridge's `Access-Control-Allow-Origin: *`.
    if (req.method === "POST" && url.pathname === "/api/host") {
      const body = await readBody(req);
      const id = typeof body.id === "string" ? body.id : "?";
      // Validated with the same guard the webview host uses, so an unknown
      // method is a 400 here rather than an unhandled cast three layers down.
      const parsed = parseHostRequest(body);
      if (!parsed.ok) {
        json(res, 400, { id, ok: false, error: parsed.reason });
        return;
      }
      const workspace =
        (typeof body.workspace === "string" ? body.workspace.trim() : "") ||
        url.searchParams.get("workspace") ||
        workspaces[0]?.path ||
        "";
      if (!workspace) {
        json(res, 200, {
          id,
          ok: false,
          error:
            "No repository registered with Prism yet. Open a repo in your editor, or run a Prism command in it.",
        });
        return;
      }
      idle.touch();
      try {
        const answer = await intelligence.handle(workspace, parsed.value);
        json(res, 200, answer);
      } catch (cause) {
        json(res, 200, { id, ok: false, error: publicCaughtError(cause) });
      }
      return;
    }

    const controlMatch = /^\/api\/jobs\/([^/]+)\/control$/.exec(url.pathname);
    if (req.method === "POST" && controlMatch) {
      const jobId = decodeURIComponent(controlMatch[1] ?? "");
      const body = await readBody(req);
      const action = String(body.action ?? "").trim();
      const workspace =
        String(body.workspace ?? "").trim() ||
        jobs.find((job) => job.id === jobId)?.workspacePath;
      if (!workspace || !action) {
        json(res, 400, { error: HUB_ERROR.actionRequired });
        return;
      }
      try {
        const extra = {
          ...(typeof body.path === "string" ? { path: body.path } : {}),
          ...(typeof body.context === "string"
            ? { context: body.context }
            : {}),
        };
        const result = await control(workspace, jobId, action, extra);
        await watcher.refresh({ drain: false });
        json(res, 200, result ?? { ok: true });
      } catch (cause) {
        json(res, 500, { error: publicCaughtError(cause) });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/settings") {
      const workspace =
        url.searchParams.get("workspace")?.trim() || workspaces[0]?.path;
      if (!workspace) {
        json(res, 400, { error: HUB_ERROR.workspaceRequired });
        return;
      }
      const config = await loadConfig(workspace);
      const entry = workspaces.find((row) => row.path === workspace);
      json(res, 200, {
        workspace,
        label: entry?.label ?? workspace,
        config,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings") {
      const body = await readBody(req);
      const workspace =
        String(body.workspace ?? "").trim() || workspaces[0]?.path;
      if (!workspace) {
        json(res, 400, { error: HUB_ERROR.workspaceRequired });
        return;
      }
      const parsed = DispatchConfigSchema.partial().safeParse(body);
      if (!parsed.success) {
        json(res, 400, { error: publicCaughtError(parsed.error) });
        return;
      }
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) patch[key] = value;
      }
      const config = await saveConfig(
        workspace,
        patch as Partial<DispatchConfig>,
      );
      json(res, 200, { workspace, config });
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      const headers: Record<string, string> = {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      };
      if (tokensMatch(liveRecord.token, tokenFromRequest(req, url))) {
        headers["Set-Cookie"] = hubCookieHeader(liveRecord.token);
      }
      await serveFile(res, join(assetsDir, "index.html"), headers);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      const relative = url.pathname.slice("/assets/".length);
      if (relative.includes("..")) {
        json(res, 400, { error: HUB_ERROR.badPath });
        return;
      }
      const file = join(assetsDir, relative);
      await serveFile(res, file, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      return;
    }

    json(res, 404, { error: HUB_ERROR.notFound });
  }

  return {
    record: liveRecord,
    url: dashboardUrl(liveRecord.port, liveRecord.token),
    close,
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body)}\n`);
}

async function readBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

async function serveFile(
  res: ServerResponse,
  path: string,
  headers: Record<string, string>,
): Promise<void> {
  try {
    await access(path);
  } catch {
    json(res, 404, { error: HUB_ERROR.notFound });
    return;
  }
  res.writeHead(200, headers);
  createReadStream(path).pipe(res);
}
