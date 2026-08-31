import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardUrl, hubEnabled, hubPort, type HubEnv } from "./paths.js";
import { isHubRecordLive, readHubRecord } from "./hub-record.js";
import type { HubRecord } from "./types.js";

export type HubHandle = {
  readonly enabled: boolean;
  readonly detail: string;
  readonly port?: number;
  readonly token?: string;
  /** Public URL, no token — safe to speak in chat. */
  readonly url?: string;
  /** Tokenised URL for the dashboard / MCP App / extension. */
  readonly dashboardUrl?: string;
};

const WAIT_MS = 3_000;
const STEP_MS = 100;

export function resolveHubBin(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "bin.js");
}

async function healthz(
  port: number,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/api/healthz`, {
      signal: AbortSignal.timeout(500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function register(
  record: HubRecord,
  workspaceRoot: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  await fetchImpl(`http://127.0.0.1:${record.port}/api/workspaces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${record.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: workspaceRoot }),
    signal: AbortSignal.timeout(2_000),
  });
}

function handleFrom(record: HubRecord, detail: string): HubHandle {
  return {
    enabled: true,
    detail,
    port: record.port,
    token: record.token,
    url: dashboardUrl(record.port),
    dashboardUrl: dashboardUrl(record.port, record.token),
  };
}

export type EnsureHubInput = {
  readonly workspaceRoot: string;
  readonly env?: HubEnv;
  readonly fetchImpl?: typeof fetch;
  readonly spawnBin?: string;
  readonly spawnHub?: () => void;
};

/**
 * Make sure a hub is listening, then register this workspace.
 * No-ops when `PRISM_HUB=0` or under vitest (unless `PRISM_HUB=1`).
 */
export async function ensureHub(input: EnsureHubInput): Promise<HubHandle> {
  const env = input.env ?? process.env;
  if (!hubEnabled(env)) {
    return { enabled: false, detail: "Jobs board is off." };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const existing = await readHubRecord(env);
  if (existing && (await healthz(existing.port, fetchImpl))) {
    try {
      await register(existing, input.workspaceRoot, fetchImpl);
    } catch {
      /* registration is best-effort */
    }
    return handleFrom(existing, "Jobs board is up.");
  }

  if (
    existing &&
    isHubRecordLive(existing) &&
    !(await healthz(existing.port, fetchImpl))
  ) {
    return {
      enabled: false,
      detail: "Jobs board is running but not answering.",
    };
  }

  (
    input.spawnHub ??
    (() => spawnDetached(input.spawnBin ?? resolveHubBin(), env))
  )();

  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(STEP_MS);
    const record = await readHubRecord(env);
    if (record && (await healthz(record.port, fetchImpl))) {
      try {
        await register(record, input.workspaceRoot, fetchImpl);
      } catch {
        /* ignore */
      }
      return handleFrom(record, "Jobs board is up.");
    }
  }
  return { enabled: false, detail: "Jobs board did not start." };
}

export async function peekHub(
  env: HubEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<HubHandle> {
  if (!hubEnabled(env)) {
    return { enabled: false, detail: "Jobs board is off." };
  }
  const record = await readHubRecord(env);
  if (!record) {
    return { enabled: false, detail: "Jobs board is not running." };
  }
  if (!(await healthz(record.port, fetchImpl))) {
    return { enabled: false, detail: "Jobs board is not running." };
  }
  return handleFrom(record, "Jobs board is up.");
}

function spawnDetached(bin: string, env: HubEnv): void {
  const child = spawn(process.execPath, [bin], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ...env } as NodeJS.ProcessEnv,
    windowsHide: true,
  });
  child.unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}

export { hubPort };
