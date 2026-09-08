/**
 * Playground Vite on :5173, parked with the same down page as the Console.
 *
 * Sleep frees the port (kills whatever is listening) and the hub serves
 * “Prism is down”. Wake starts `apps/playground` again when this repo has one.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { consoleHost, hubHome, type HubEnv } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

const execFileAsync = promisify(execFile);

export const PLAYGROUND_PORT = 5173;

export type PlaygroundMode = "vite" | "asleep";

export type PlaygroundRecord = {
  readonly port: number;
  readonly mode: PlaygroundMode;
  readonly pid?: number;
};

export type PlaygroundHandle = {
  readonly enabled: boolean;
  readonly detail: string;
  readonly url?: string;
  readonly port?: number;
};

export function playgroundPort(env: HubEnv = process.env): number {
  const raw = env.PRISM_PLAYGROUND_PORT?.trim();
  if (raw === "0") return 0;
  const parsed = raw ? Number.parseInt(raw, 10) : PLAYGROUND_PORT;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : PLAYGROUND_PORT;
}

/** Tests must not steal the user's :5173. */
export function effectivePlaygroundPort(env: HubEnv = process.env): number {
  if (env.PRISM_PLAYGROUND_PORT?.trim()) return playgroundPort(env);
  if (process.env.VITEST === "true") return 0;
  return PLAYGROUND_PORT;
}

export function playgroundViteEnabled(env: HubEnv = process.env): boolean {
  if (env.PRISM_PLAYGROUND === "0") return false;
  if (
    (env.VITEST === "true" || process.env.VITEST === "true") &&
    env.PRISM_PLAYGROUND !== "1"
  ) {
    return false;
  }
  return true;
}

export function playgroundRecordPath(env: HubEnv = process.env): string {
  return join(hubHome(env), "playground.json");
}

export function playgroundUrl(port: number, env: HubEnv = process.env): string {
  return `http://${consoleHost(env)}:${port}/`;
}

/** Bind/health checks stay on loopback — the daemon listens on 127.0.0.1. */
export function playgroundBindUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

async function playgroundPackageAt(dir: string): Promise<string | undefined> {
  try {
    await access(join(dir, "package.json"));
    return dir;
  } catch {
    return undefined;
  }
}

export async function findPlaygroundApp(
  workspaceRoot: string,
  extraRoots: readonly string[] = [],
): Promise<string | undefined> {
  const roots = [workspaceRoot, ...extraRoots].filter((root) => root.trim());
  const seen = new Set<string>();
  for (const root of roots) {
    const candidate = join(root, "apps", "playground");
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const found = await playgroundPackageAt(candidate);
    if (found) return found;
  }
  return undefined;
}

/**
 * Where Vite actually lives: the requested repo, other registered
 * workspaces, `PRISM_PLAYGROUND_ROOT`, then this Prism checkout. Tests stay
 * isolated — they only see the workspace unless they opt in.
 */
export async function resolvePlaygroundApp(
  workspaceRoot: string,
  extraRoots: readonly string[] = [],
  env: HubEnv = process.env,
): Promise<string | undefined> {
  const found = await findPlaygroundApp(workspaceRoot, extraRoots);
  if (found) return found;
  const override = env.PRISM_PLAYGROUND_ROOT?.trim();
  if (override) {
    const fromOverride =
      (await playgroundPackageAt(override)) ??
      (await findPlaygroundApp(override));
    if (fromOverride) return fromOverride;
  }
  if (env.VITEST === "true" || process.env.VITEST === "true") return undefined;
  const hubRepo = fileURLToPath(new URL("../../..", import.meta.url));
  return findPlaygroundApp(hubRepo);
}

export async function readPlaygroundRecord(
  env: HubEnv = process.env,
): Promise<PlaygroundRecord | undefined> {
  const file = await readJsonFile<Partial<PlaygroundRecord> | null>(
    playgroundRecordPath(env),
    null,
  );
  if (!file || typeof file.port !== "number") return undefined;
  if (file.mode !== "vite" && file.mode !== "asleep") return undefined;
  return {
    port: file.port,
    mode: file.mode,
    ...(typeof file.pid === "number" ? { pid: file.pid } : {}),
  };
}

export async function writePlaygroundRecord(
  env: HubEnv,
  record: PlaygroundRecord,
): Promise<void> {
  await writeJsonFile(playgroundRecordPath(env), record);
}

export async function pidsOnPort(port: number): Promise<number[]> {
  if (port <= 0) return [];
  try {
    const { stdout } = await execFileAsync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { timeout: 1500 },
    );
    return stdout
      .split(/\s+/)
      .map((row) => Number.parseInt(row, 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

export async function stopPlaygroundListeners(
  port: number,
  extraPid?: number,
): Promise<void> {
  const pids = new Set(await pidsOnPort(port));
  if (typeof extraPid === "number") pids.add(extraPid);
  for (const pid of pids) stopPid(pid);
}

function stopPid(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    /* not a group leader */
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

export async function spawnPlaygroundVite(input: {
  readonly workspaceRoot: string;
  readonly extraRoots?: readonly string[];
  readonly env?: HubEnv;
}): Promise<{ pid: number } | undefined> {
  const env = input.env ?? process.env;
  const app = await resolvePlaygroundApp(
    input.workspaceRoot,
    input.extraRoots ?? [],
    env,
  );
  if (!app) return undefined;
  const child = spawn("bun", ["run", "dev"], {
    cwd: app,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ...(input.env as NodeJS.ProcessEnv),
      PRISM_PLAYGROUND_ROOT: input.workspaceRoot,
    },
    windowsHide: true,
  });
  child.unref();
  if (typeof child.pid !== "number") return undefined;
  return { pid: child.pid };
}

export async function playgroundIsLive(
  port: number,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (port <= 0) return false;
  try {
    const response = await fetchImpl(playgroundBindUrl(port), {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return false;
    const text = await response.text();
    return !/Prism is down/i.test(text);
  } catch {
    return false;
  }
}

export async function playgroundIsDownPage(
  port: number,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (port <= 0) return false;
  try {
    const response = await fetchImpl(playgroundBindUrl(port), {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return false;
    const text = await response.text();
    return /Prism is down/i.test(text);
  } catch {
    return false;
  }
}

export async function waitForPlaygroundLive(
  port: number,
  fetchImpl: typeof fetch = fetch,
  waitMs = 20_000,
): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await playgroundIsLive(port, fetchImpl)) return true;
    await new Promise((resolve) => {
      setTimeout(resolve, 200).unref?.();
    });
  }
  return false;
}
