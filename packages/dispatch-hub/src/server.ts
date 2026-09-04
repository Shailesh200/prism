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
  readRunLog,
  saveConfig,
  type DispatchConfig,
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
import { dashboardUrl, hubPort, type HubEnv } from "./paths.js";
import { dropMissingWorkspaces, registerWorkspace } from "./registry.js";
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
  extra?: { readonly path?: string },
) => Promise<unknown>;

export type HubOptions = {
  readonly env?: HubEnv;
  readonly notify?: NotifyFn;
  readonly idleMs?: number;
  readonly pollMs?: number;
  readonly assetsDir?: string;
  readonly control?: JobControlFn;
  readonly version?: string;
  /** Injected in tests; production drains through `@repo-prism/dispatch`. */
  readonly drain?: (workspacePath: string) => Promise<void>;
  /** Injected in tests; production lazily imports Core (ADR-0048). */
  readonly intelligence?: IntelligencePlane;
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

async function defaultControl(
  workspacePath: string,
  jobId: string,
  action: string,
  extra?: { readonly path?: string },
): Promise<unknown> {
  const runtime = createDispatchRuntime({
    workspaceRoot: workspacePath,
    worker: createCursorWorkerPort(),
    claudeWorker: createClaudeWorkerPort(),
  });
  return runtime.handle("job_control", {
    jobId,
    action,
    ...(extra?.path ? { path: extra.path } : {}),
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
async function defaultDrain(workspacePath: string): Promise<void> {
  const cursor = createCursorWorkerPort();
  const claude = createClaudeWorkerPort();
  const runtime = createDispatchRuntime({
    workspaceRoot: workspacePath,
    worker: cursor,
    claudeWorker: claude,
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
  const version = options.version ?? packageVersion();
  const intelligence = options.intelligence ?? createIntelligencePlane();
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

  // The hub tick is the queue's safety net (ADR-0047). `start_job` kicks its
  // own drain, but that kick dies with the MCP process; this catches anything
  // left `queued`, and re-checks jobs parked behind the concurrency cap.
  const watcher = watchWorkspaces(() => workspaces, onEvent, {
    pollMs: options.pollMs,
    drain: options.drain ?? defaultDrain,
  });

  const idle = createIdleTimer({
    idleMs: options.idleMs ?? IDLE_MS,
    shouldExit: () => sse.size === 0 && !jobs.some(isInFlight),
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
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
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
  const initial = await collectJobs(workspaces);
  broadcast({
    type: "snapshot",
    jobs: initial.jobs,
    asOf: new Date().toISOString(),
    errors: initial.errors,
  });

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const host = req.headers.host ?? `127.0.0.1:${liveRecord.port}`;
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (!originAllowed(req.headers.origin)) {
      json(res, 403, { error: "origin not allowed" });
      return;
    }

    if (url.pathname === "/api/healthz") {
      json(res, 200, {
        ok: true,
        port: liveRecord.port,
        pid: process.pid,
        version,
        workspaces: workspaces.length,
        // Whether the Intelligence plane has actually loaded Core, and on
        // what. A reader can tell an idle Console from a busy one.
        intelligence: {
          loaded: intelligence.loaded(),
          workspace: intelligence.openWorkspace() ?? null,
        },
      });
      return;
    }

    const isApi = url.pathname.startsWith("/api/");
    if (isApi && !tokensMatch(liveRecord.token, tokenFromRequest(req, url))) {
      json(res, 401, { error: "unauthorized" });
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
        json(res, 400, { error: "workspace required" });
        return;
      }
      const page = await readRunLog(workspace, jobId, {
        limit: Number(url.searchParams.get("limit") ?? "200") || 200,
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
        json(res, 400, { error: "workspace required" });
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
            json(res, 404, { error: "note not found" });
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
        json(res, 500, { error: "note read failed" });
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
        json(res, 400, { error: "path required" });
        return;
      }
      workspaces = await registerWorkspace(path, env);
      void watcher.refresh();
      json(res, 200, { workspaces });
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
        const message = cause instanceof Error ? cause.message : String(cause);
        json(res, 200, { id, ok: false, error: message });
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
        json(res, 400, { error: "workspace and action required" });
        return;
      }
      try {
        const result = await control(
          workspace,
          jobId,
          action,
          typeof body.path === "string" ? { path: body.path } : {},
        );
        await watcher.refresh({ drain: false });
        json(res, 200, result ?? { ok: true });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        json(res, 500, { error: message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/settings") {
      const workspace =
        url.searchParams.get("workspace")?.trim() || workspaces[0]?.path;
      if (!workspace) {
        json(res, 400, { error: "workspace required" });
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
        json(res, 400, { error: "workspace required" });
        return;
      }
      const parsed = DispatchConfigSchema.partial().safeParse(body);
      if (!parsed.success) {
        json(res, 400, { error: parsed.error.message });
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
        json(res, 400, { error: "bad path" });
        return;
      }
      const file = join(assetsDir, relative);
      await serveFile(res, file, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      });
      return;
    }

    json(res, 404, { error: "not found" });
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
    json(res, 404, { error: "not found" });
    return;
  }
  res.writeHead(200, headers);
  createReadStream(path).pipe(res);
}
