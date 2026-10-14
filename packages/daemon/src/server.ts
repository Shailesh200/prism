/**
 * The Prism daemon (ADR-0063). It indexes, watches and answers. It never
 * edits files, never runs a model, never runs a job.
 *
 * Loopback only. Every request needs the per-user token from the 0600 record
 * file, and any request carrying an `Origin` header is refused: no browser
 * page has a reason to talk to this process, so DNS rebinding has nothing to
 * aim at.
 */

import { timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { setPriority } from "node:os";
import { isAbsolute, join } from "node:path";
import type { PrismWorkspace } from "@repo-prism/core";
import {
  type PrismError,
  PrismErrorCode,
  type Result,
  prismError,
} from "@repo-prism/shared";
import { readBattery, shouldPauseForBattery } from "./battery.js";
import { recordEvent } from "@repo-prism/shared/events";
import { BUILD_HEADER, type DaemonStatus, daemonHealth } from "./client.js";
import { type DaemonConfig, readDaemonConfig } from "./config.js";
import { daemonDir } from "./paths.js";
import { createWorkspacePool, type WorkspacePool } from "./pool.js";
import {
  type DaemonRecord,
  isProcessAlive,
  newDaemonToken,
  readDaemonRecord,
  removeDaemonRecord,
  writeDaemonRecord,
} from "./record.js";

export type DaemonToolContext = {
  readonly workspace: PrismWorkspace;
  readonly workspaceRoot: string;
};

export type DaemonTool = {
  /** Validates raw JSON arguments; the same schema the MCP tool declares. */
  parseArgs(raw: unknown): Result<unknown, PrismError>;
  call(
    context: DaemonToolContext,
    args: unknown,
  ): Promise<Result<unknown, PrismError>>;
};

export type StartDaemonOptions = {
  readonly buildId: string;
  readonly tools: ReadonlyMap<string, DaemonTool>;
  readonly onIndexed?: (workspace: PrismWorkspace) => Promise<void>;
  readonly env?: NodeJS.ProcessEnv;
  readonly config?: Partial<DaemonConfig>;
  readonly openWorkspace?: Parameters<
    typeof createWorkspacePool
  >[0]["openWorkspace"];
  readonly log?: (line: string) => void;
  /** Off in tests that drive the clock themselves. */
  readonly timers?: boolean;
};

export type StartedDaemon = {
  readonly port: number;
  readonly token: string;
  readonly pool: WorkspacePool;
  close(): Promise<void>;
};

export type DaemonStartOutcome =
  | ({ readonly kind: "started" } & StartedDaemon)
  | { readonly kind: "already-running"; readonly record: DaemonRecord };

const MAX_BODY_BYTES = 1024 * 1024;

function send(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function fail(
  res: ServerResponse,
  status: number,
  code: PrismErrorCode,
  message: string,
): void {
  send(res, status, { ok: false, error: prismError(code, message) });
}

function sameToken(expected: string, header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length).trim());
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

function loopbackHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(
    host,
  );
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Exclusive lock so two daemons starting at once cannot both win. A lock
 * left by a dead process is taken over.
 */
async function takeLock(
  env: NodeJS.ProcessEnv,
): Promise<(() => Promise<void>) | null> {
  const path = join(daemonDir(env), "daemon.lock");
  await mkdir(daemonDir(env), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => {
        const owner = await readFile(path, "utf8").catch(() => "");
        if (owner.trim() === String(process.pid))
          await rm(path, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = Number(await readFile(path, "utf8").catch(() => ""));
      // A starter that has not begun answering within this window is taken
      // to be a reused pid, not a daemon still coming up.
      const info = await stat(path).catch((statError: unknown) => {
        // The lock vanished between open and stat: treat it as infinitely old.
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw statError;
      });
      const age = info ? Date.now() - info.mtimeMs : Number.POSITIVE_INFINITY;
      if (owner === process.pid) return null;
      if (isProcessAlive(owner) && age < 30_000) return null;
      await rm(path, { force: true });
    }
  }
  return null;
}

export async function startDaemon(
  options: StartDaemonOptions,
): Promise<DaemonStartOutcome> {
  const env = options.env ?? process.env;
  const log =
    options.log ??
    ((line: string) => process.stderr.write(`prism-daemon: ${line}\n`));

  const existing = await readDaemonRecord(env);
  if (existing) {
    // Only a daemon that answers with the token counts as running.
    const answering = await daemonHealth({
      env: { ...env, PRISM_DAEMON: "1" },
      timeoutMs: 1_000,
    });
    if (answering.kind === "ok") {
      return { kind: "already-running", record: existing };
    }
  }
  const release = await takeLock(env);
  if (!release) {
    const record = await readDaemonRecord(env);
    if (record) return { kind: "already-running", record };
    throw new Error("another daemon holds the lock but wrote no record");
  }

  const config: DaemonConfig = {
    ...(await readDaemonConfig(env)),
    ...options.config,
  };
  try {
    setPriority(config.nice);
  } catch (error) {
    // Lowering priority is best-effort; record that it did not happen.
    recordEvent({
      event: "daemon.nice",
      outcome: "degraded",
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const pool = createWorkspacePool({
    debounceMs: config.debounceMs,
    maxWorkspaces: config.maxWorkspaces,
    log,
    ...(options.onIndexed ? { onIndexed: options.onIndexed } : {}),
    ...(options.openWorkspace ? { openWorkspace: options.openWorkspace } : {}),
  });

  const token = newDaemonToken();
  const startedAt = new Date().toISOString();
  let lastRequest = Date.now();
  let pauseReason: string | null = null;
  let port = 0;
  let closing: Promise<void> | undefined;

  const status = (): DaemonStatus => ({
    pid: process.pid,
    port,
    buildId: options.buildId,
    startedAt,
    paused: pauseReason !== null,
    pauseReason,
    rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    workspaces: pool.status(),
  });

  const handle = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    if (req.headers.origin !== undefined) {
      return fail(res, 403, PrismErrorCode.VALIDATION, "browsers are refused");
    }
    if (!loopbackHost(req.headers.host, port)) {
      return fail(res, 403, PrismErrorCode.VALIDATION, "loopback only");
    }
    if (!sameToken(token, req.headers.authorization)) {
      return fail(res, 401, PrismErrorCode.VALIDATION, "bad or missing token");
    }
    const build = req.headers[BUILD_HEADER];
    if (typeof build === "string" && build !== options.buildId) {
      return fail(
        res,
        409,
        PrismErrorCode.UNSUPPORTED,
        `daemon build ${options.buildId}, client build ${build}`,
      );
    }
    lastRequest = Date.now();
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;

    if (req.method === "GET" && path === "/v1/health") {
      // The liveness probe (plan §10 P1): a token-checked answer replaces
      // "is the pid alive", which a reused pid can fake.
      return send(res, 200, {
        ok: true,
        value: { pid: process.pid, buildId: options.buildId, startedAt },
      });
    }
    if (req.method === "GET" && path === "/v1/status") {
      return send(res, 200, { ok: true, value: status() });
    }
    if (req.method !== "POST") {
      return fail(res, 404, PrismErrorCode.NOT_FOUND, "no such route");
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await readBody(req);
      body =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : {};
    } catch (error) {
      return fail(res, 400, PrismErrorCode.VALIDATION, String(error));
    }

    if (path === "/v1/stop") {
      send(res, 200, { ok: true, value: { stopping: true } });
      setImmediate(() => void close());
      return;
    }

    const root = body.root;
    if (typeof root !== "string" || !isAbsolute(root)) {
      return fail(
        res,
        400,
        PrismErrorCode.INVALID_PATH,
        "root must be an absolute path",
      );
    }

    if (path === "/v1/workspaces") {
      pool.warm(root);
      return send(res, 200, { ok: true, value: { accepted: true } });
    }

    if (path === "/v1/reindex") {
      // Git hooks call this after a checkout or merge rewrote many files at once.
      const ready = await pool.get(root);
      if (!ready.ok) return send(res, 200, { ok: false, error: ready.error });
      const reindexed = await ready.value.reindex();
      return send(
        res,
        200,
        reindexed.ok
          ? { ok: true, value: { indexedAt: reindexed.value.indexedAt } }
          : { ok: false, error: reindexed.error },
      );
    }

    if (path === "/v1/call") {
      const tool =
        typeof body.tool === "string"
          ? options.tools.get(body.tool)
          : undefined;
      if (!tool) {
        return fail(
          res,
          404,
          PrismErrorCode.NOT_FOUND,
          `unknown tool ${String(body.tool)}`,
        );
      }
      const args = tool.parseArgs(body.args ?? {});
      if (!args.ok) return send(res, 400, { ok: false, error: args.error });
      const ready = await pool.get(root);
      if (!ready.ok) return send(res, 200, { ok: false, error: ready.error });
      try {
        const result = await tool.call(
          { workspace: ready.value, workspaceRoot: root },
          args.value,
        );
        return send(
          res,
          200,
          result.ok
            ? { ok: true, value: result.value ?? null }
            : { ok: false, error: result.error },
        );
      } catch (error) {
        // 500 tells the client to fall back in-process instead of surfacing it.
        return fail(
          res,
          500,
          PrismErrorCode.UNKNOWN,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return fail(res, 404, PrismErrorCode.NOT_FOUND, "no such route");
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) {
        fail(res, 500, PrismErrorCode.UNKNOWN, String(error));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  await writeDaemonRecord(
    { pid: process.pid, port, token, buildId: options.buildId, startedAt },
    env,
  );
  log(`listening on 127.0.0.1:${port} (build ${options.buildId})`);

  const intervals: ReturnType<typeof setInterval>[] = [];
  if (options.timers !== false) {
    const idleMs = config.idleMinutes * 60_000;
    intervals.push(
      setInterval(() => {
        if (idleMs > 0 && Date.now() - lastRequest > idleMs) {
          log(`idle for ${config.idleMinutes} minutes, stopping`);
          void close();
        }
      }, 30_000),
      setInterval(() => {
        const rssMb = process.memoryUsage().rss / (1024 * 1024);
        if (rssMb > config.maxMemoryMb && pool.evictOne()) {
          log(`memory ${Math.round(rssMb)}MB over ${config.maxMemoryMb}MB cap`);
        }
      }, 15_000),
      setInterval(() => {
        void readBattery().then((battery) => {
          const pause = shouldPauseForBattery(
            battery,
            config.batteryPausePercent,
          );
          pauseReason = pause
            ? `on battery at ${battery?.percent}% (below ${config.batteryPausePercent}%)`
            : null;
          pool.setPaused(pause);
        });
      }, 60_000),
    );
    for (const interval of intervals) interval.unref();
  }

  async function close(): Promise<void> {
    if (closing) return closing;
    closing = (async () => {
      for (const interval of intervals) clearInterval(interval);
      pool.closeAll();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections?.();
      await removeDaemonRecord(process.pid, env);
      await release?.();
      log("stopped");
    })();
    return closing;
  }

  return { kind: "started", port, token, pool, close };
}
