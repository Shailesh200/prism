/**
 * Playground Vite on :17331 (next to the Console on :17330), parked with the
 * same down page as the Console. 5173 is Vite’s default and collides with
 * other local apps; override with `PRISM_PLAYGROUND_PORT` when needed.
 *
 * Sleep frees the port (kills whatever is listening) and the hub serves
 * “Prism is down”. Wake starts `apps/playground` again when this repo has one.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { consoleHost, hubHome, type HubEnv } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

const execFileAsync = promisify(execFile);

export const PLAYGROUND_PORT = 17331;

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

/** Tests must not steal the user's playground port. */
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

const DEFAULT_NODE_VERSION = "26.5.0";

function readNvmrcVersion(dir: string | undefined): string | undefined {
  if (!dir) return undefined;
  try {
    const raw = readFileSync(join(dir, ".nvmrc"), "utf8").trim();
    return raw.replace(/^v/, "") || undefined;
  } catch {
    return undefined;
  }
}

function nodeBinaryName(): string {
  return process.platform === "win32" ? "node.exe" : "node";
}

/**
 * Node that can dlopen `better-sqlite3` (ABI must match the compiled addon).
 * PATH `node` is often Cursor's helper (different ABI), so we prefer nvm/proto
 * matching `.nvmrc` / `engines.node`.
 */
export function resolvePlaygroundNode(
  input: {
    readonly workspaceRoot?: string;
    readonly playgroundApp?: string;
    readonly env?: HubEnv;
  } = {},
): string {
  const env = input.env ?? process.env;
  const override = env.PRISM_NODE?.trim();
  if (override && existsSync(override)) return override;

  const version =
    env.PRISM_NODE_VERSION?.trim() ||
    readNvmrcVersion(input.workspaceRoot) ||
    readNvmrcVersion(
      input.playgroundApp ? join(input.playgroundApp, "..", "..") : undefined,
    ) ||
    DEFAULT_NODE_VERSION;
  const exe = nodeBinaryName();
  const nvmDir = env.NVM_DIR?.trim() || join(homedir(), ".nvm");
  const candidates = [
    join(nvmDir, "versions", "node", `v${version}`, "bin", exe),
    join(homedir(), ".proto", "tools", "node", version, "bin", exe),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return exe;
}

export function playgroundViteEntry(app: string): string {
  return join(app, "node_modules", "vite", "bin", "vite.js");
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
  readonly port?: number;
}): Promise<{ pid: number } | undefined> {
  const env = input.env ?? process.env;
  const port = input.port ?? playgroundPort(env);
  if (port <= 0) return undefined;
  const app = await resolvePlaygroundApp(
    input.workspaceRoot,
    input.extraRoots ?? [],
    env,
  );
  if (!app) return undefined;
  const nodeBin = resolvePlaygroundNode({
    workspaceRoot: input.workspaceRoot,
    playgroundApp: app,
    env,
  });
  const vite = playgroundViteEntry(app);
  const child = spawn(
    nodeBin,
    [vite, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: app,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        ...(input.env as NodeJS.ProcessEnv),
        PATH: `${dirname(nodeBin)}${delimiter}${process.env.PATH ?? ""}`,
        PRISM_PLAYGROUND_ROOT: input.workspaceRoot,
        PRISM_PLAYGROUND_PORT: String(port),
      },
      windowsHide: true,
    },
  );
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
