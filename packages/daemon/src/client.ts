/**
 * Attach-first client (ADR-0063 §3). Every function here answers
 * `unavailable` instead of throwing, so a caller can always fall back to
 * in-process Core without a special case for "the daemon died mid-call".
 */

import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { PrismError } from "@repo-prism/shared";
import { daemonDir, daemonEnabled, daemonLogPath } from "./paths.js";
import {
  type DaemonRecord,
  isProcessAlive,
  readDaemonRecord,
} from "./record.js";

export type DaemonOutcome<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "error"; readonly error: PrismError }
  | { readonly kind: "unavailable"; readonly reason: string };

export type DaemonWorkspaceStatus = {
  readonly root: string;
  readonly state: "indexing" | "fresh" | "stale" | "failed" | "paused";
  readonly lastIndexedAt: string | null;
  readonly pendingDirtyCount: number;
  readonly lastUsedAt: string;
  readonly lastReindexMs: number | null;
  readonly error?: string;
};

export type DaemonStatus = {
  readonly pid: number;
  readonly port: number;
  readonly buildId: string;
  readonly startedAt: string;
  readonly paused: boolean;
  readonly pauseReason: string | null;
  readonly rssMb: number;
  readonly workspaces: readonly DaemonWorkspaceStatus[];
};

export const BUILD_HEADER = "x-prism-build";

type ClientOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  /** When set, a daemon from another build is treated as absent. */
  readonly buildId?: string;
};

async function liveRecord(
  env: NodeJS.ProcessEnv,
): Promise<DaemonRecord | string> {
  if (!daemonEnabled(env)) return "daemon is off (PRISM_DAEMON=0)";
  const record = await readDaemonRecord(env);
  if (!record) return "daemon is not running";
  // Liveness is the token-checked request itself, not a pid probe.
  return record;
}

async function request<T>(
  record: DaemonRecord,
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options: ClientOptions,
): Promise<DaemonOutcome<T>> {
  try {
    const response = await fetch(`http://127.0.0.1:${record.port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${record.token}`,
        ...(options.buildId ? { [BUILD_HEADER]: options.buildId } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 2_000),
    });
    if (response.status === 409) {
      return { kind: "unavailable", reason: "daemon is from another build" };
    }
    const payload = (await response.json()) as
      | { ok: true; value: T }
      | { ok: false; error: PrismError };
    if (payload.ok) return { kind: "ok", value: payload.value };
    if (response.status >= 500 || !payload.error) {
      return {
        kind: "unavailable",
        reason: payload.error?.message ?? `daemon answered ${response.status}`,
      };
    }
    return { kind: "error", error: payload.error };
  } catch (cause) {
    const reason =
      cause instanceof Error && cause.name === "TimeoutError"
        ? "daemon did not answer in time"
        : "daemon is not reachable";
    return { kind: "unavailable", reason };
  }
}

export type DaemonHealth = {
  readonly pid: number;
  readonly buildId: string;
  readonly startedAt: string;
};

/** Token-checked liveness probe (`GET /v1/health`). */
export async function daemonHealth(
  options: ClientOptions = {},
): Promise<DaemonOutcome<DaemonHealth>> {
  const record = await liveRecord(options.env ?? process.env);
  if (typeof record === "string")
    return { kind: "unavailable", reason: record };
  return request<DaemonHealth>(record, "GET", "/v1/health", undefined, {
    timeoutMs: 500,
    ...options,
  });
}

/** Run one tool against the daemon's warm workspace for `root`. */
export async function callDaemonTool<T = unknown>(
  input: {
    readonly root: string;
    readonly tool: string;
    readonly args: unknown;
  } & ClientOptions,
): Promise<DaemonOutcome<T>> {
  const env = input.env ?? process.env;
  const record = await liveRecord(env);
  if (typeof record === "string")
    return { kind: "unavailable", reason: record };
  return request<T>(
    record,
    "POST",
    "/v1/call",
    { root: input.root, tool: input.tool, args: input.args ?? {} },
    { ...input, timeoutMs: input.timeoutMs ?? 120_000 },
  );
}

/** Ask the daemon to open and index `root` in the background. */
export async function warmDaemonWorkspace(
  input: { readonly root: string } & ClientOptions,
): Promise<DaemonOutcome<{ readonly accepted: boolean }>> {
  const env = input.env ?? process.env;
  const record = await liveRecord(env);
  if (typeof record === "string")
    return { kind: "unavailable", reason: record };
  return request(record, "POST", "/v1/workspaces", { root: input.root }, input);
}

/** Full reindex of `root`, for git hooks after a branch switch. */
export async function reindexDaemonWorkspace(
  input: { readonly root: string } & ClientOptions,
): Promise<DaemonOutcome<{ readonly indexedAt: string }>> {
  const env = input.env ?? process.env;
  const record = await liveRecord(env);
  if (typeof record === "string")
    return { kind: "unavailable", reason: record };
  return request(
    record,
    "POST",
    "/v1/reindex",
    { root: input.root },
    { ...input, timeoutMs: input.timeoutMs ?? 120_000 },
  );
}

export async function daemonStatus(
  options: ClientOptions = {},
): Promise<DaemonOutcome<DaemonStatus>> {
  const env = options.env ?? process.env;
  const record = await liveRecord(env);
  if (typeof record === "string")
    return { kind: "unavailable", reason: record };
  return request<DaemonStatus>(record, "GET", "/v1/status", undefined, options);
}

export async function stopDaemon(
  options: ClientOptions = {},
): Promise<DaemonOutcome<{ readonly stopping: boolean }>> {
  const env = options.env ?? process.env;
  const record = await liveRecord(env);
  if (typeof record === "string")
    return { kind: "unavailable", reason: record };
  const outcome = await request<{ stopping: boolean }>(
    record,
    "POST",
    "/v1/stop",
    {},
    { env },
  );
  if (outcome.kind === "unavailable" && isProcessAlive(record.pid)) {
    try {
      process.kill(record.pid, "SIGTERM");
      return { kind: "ok", value: { stopping: true } };
    } catch {
      return outcome;
    }
  }
  return outcome;
}

export type EnsureDaemonInput = {
  /** The executable and arguments that start a daemon in the foreground. */
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly buildId?: string;
  /** How long to wait for it to answer. 0 starts it and returns at once. */
  readonly waitMs?: number;
};

/** Kept referenced: a CLI with nothing else pending would exit mid-wait. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make sure a daemon from this build is running. A daemon from another
 * build is stopped and replaced, so `dev:link` never leaves a stale one
 * answering (M-095 risks).
 */
export async function ensureDaemon(
  input: EnsureDaemonInput,
): Promise<DaemonOutcome<{ readonly started: boolean }>> {
  const env = input.env ?? process.env;
  if (!daemonEnabled(env)) {
    return { kind: "unavailable", reason: "daemon is off (PRISM_DAEMON=0)" };
  }
  const current = await daemonStatus({ env, timeoutMs: 1_000 });
  if (current.kind === "ok") {
    if (!input.buildId || current.value.buildId === input.buildId) {
      return { kind: "ok", value: { started: false } };
    }
    await stopDaemon({ env });
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline && isProcessAlive(current.value.pid)) {
      await sleep(50);
    }
  }

  await mkdir(daemonDir(env), { recursive: true, mode: 0o700 });
  const log = openSync(daemonLogPath(env), "a", 0o600);
  const child = spawn(input.command, [...input.args], {
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...env, PRISM_DAEMON: "1" },
    windowsHide: true,
  });
  child.unref();

  const waitMs = input.waitMs ?? 3_000;
  if (waitMs === 0) return { kind: "ok", value: { started: true } };
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(100);
    const status = await daemonStatus({ env, timeoutMs: 500 });
    if (status.kind === "ok") return { kind: "ok", value: { started: true } };
  }
  return { kind: "unavailable", reason: "daemon did not start in time" };
}
