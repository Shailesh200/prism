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
  readRunLog,
} from "@repo-prism/dispatch";
import { originAllowed, tokenFromRequest, tokensMatch } from "./auth.js";
import { createIdleTimer, IDLE_MS } from "./idle.js";
import { newHubToken, packageVersion, writeHubRecord } from "./hub-record.js";
import { formatJobFinishedNotice } from "./notice.js";
import { createOsNotifier, type NotifyFn } from "./notify.js";
import { dashboardUrl, hubPort, type HubEnv } from "./paths.js";
import { dropMissingWorkspaces, registerWorkspace } from "./registry.js";
import type {
  HubEvent,
  HubRecord,
  JobSnapshot,
  WorkspaceEntry,
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
  extra?: Record<string, unknown>,
) => Promise<unknown>;

export type HubOptions = {
  readonly env?: HubEnv;
  readonly notify?: NotifyFn;
  readonly idleMs?: number;
  readonly pollMs?: number;
  readonly assetsDir?: string;
  readonly control?: JobControlFn;
  readonly version?: string;
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
  extra: Record<string, unknown> = {},
): Promise<unknown> {
  const runtime = createDispatchRuntime({
    workspaceRoot: workspacePath,
    worker: createCursorWorkerPort(),
    claudeWorker: createClaudeWorkerPort(),
  });
  return runtime.handle("job_control", { jobId, action, ...extra });
}

export async function startHub(
  options: HubOptions = {},
): Promise<StartedHub | { alreadyRunning: true }> {
  const env = options.env ?? process.env;
  const notify = options.notify ?? createOsNotifier();
  const assetsDir = options.assetsDir ?? defaultAssetsDir();
  const control = options.control ?? defaultControl;
  const version = options.version ?? packageVersion();
  const token = newHubToken();
  const wantedPort = hubPort(env);

  let workspaces: WorkspaceEntry[] = await dropMissingWorkspaces(
    pathExists,
    env,
  );
  const sse = new Set<SseClient>();
  let jobs: JobSnapshot[] = [];
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
    if (event.type === "snapshot") jobs = [...event.jobs];
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

  const watcher = watchWorkspaces(() => workspaces, onEvent, {
    pollMs: options.pollMs,
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
  jobs = await collectJobs(workspaces);
  broadcast({ type: "snapshot", jobs });

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
      });
      return;
    }

    const isApi = url.pathname.startsWith("/api/");
    if (isApi && !tokensMatch(liveRecord.token, tokenFromRequest(req, url))) {
      json(res, 401, { error: "unauthorized" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/jobs") {
      json(res, 200, { jobs });
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

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const client = { res };
      sse.add(client);
      idle.touch();
      res.write(`data: ${JSON.stringify({ type: "snapshot", jobs })}\n\n`);
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
        const extra: Record<string, unknown> = {};
        if (body.confirmDirty === true) extra.confirmDirty = true;
        const result = await control(workspace, jobId, action, extra);
        void watcher.refresh();
        json(res, 200, result ?? { ok: true });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        json(res, 500, { error: message });
      }
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      await serveFile(
        res,
        join(assetsDir, "index.html"),
        "text/html; charset=utf-8",
      );
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      const relative = url.pathname.slice("/assets/".length);
      if (relative.includes("..")) {
        json(res, 400, { error: "bad path" });
        return;
      }
      const file = join(assetsDir, relative);
      await serveFile(
        res,
        file,
        MIME[extname(file)] ?? "application/octet-stream",
      );
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
  mime: string,
): Promise<void> {
  try {
    await access(path);
  } catch {
    json(res, 404, { error: "not found" });
    return;
  }
  res.writeHead(200, { "Content-Type": mime });
  createReadStream(path).pipe(res);
}
