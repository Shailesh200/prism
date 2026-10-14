/**
 * Dashboard Vite on :17331. The hub daemon on :17330 keeps APIs and Iris/Skills
 * embeds; GET / on the daemon redirects here. Parked with the same down page.
 * 5173 is Vite’s default and collides with other local apps; override with
 * `PRISM_PLAYGROUND_PORT` when needed.
 *
 * Sleep frees the port (kills whatever is listening) and the hub serves
 * “Prism is down”. Wake starts `apps/playground` again when this repo has one.
 */

import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const DEFAULT_NODE_VERSION = "24.18.1";

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
function canDlopenSqlite(
  nodeBin: string,
  repoRoot: string | undefined,
): boolean {
  if (!repoRoot) return false;
  const indexerPkg = join(repoRoot, "packages/indexer/package.json");
  if (!existsSync(indexerPkg)) return false;
  const script = `
    import { createRequire } from "node:module";
    import { pathToFileURL } from "node:url";
    const req = createRequire(pathToFileURL(${JSON.stringify(indexerPkg)}).href);
    const Database = req("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
  `;
  const result = spawnSync(nodeBin, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 8000,
  });
  return result.status === 0;
}

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

  const repoRoot =
    input.workspaceRoot ??
    (input.playgroundApp ? join(input.playgroundApp, "..", "..") : undefined);
  const version =
    env.PRISM_NODE_VERSION?.trim() ||
    readNvmrcVersion(repoRoot) ||
    DEFAULT_NODE_VERSION;
  const exe = nodeBinaryName();
  const nvmDir = env.NVM_DIR?.trim() || join(homedir(), ".nvm");
  const pinned = join(nvmDir, "versions", "node", `v${version}`, "bin", exe);
  if (existsSync(pinned) && canDlopenSqlite(pinned, repoRoot)) return pinned;

  const versions = new Set<string>([version]);
  try {
    for (const name of readdirSync(join(nvmDir, "versions", "node"))) {
      versions.add(name.replace(/^v/, ""));
    }
  } catch {
    /* no nvm */
  }
  for (const ver of versions) {
    const candidate = join(nvmDir, "versions", "node", `v${ver}`, "bin", exe);
    if (existsSync(candidate) && canDlopenSqlite(candidate, repoRoot)) {
      return candidate;
    }
    const proto = join(homedir(), ".proto", "tools", "node", ver, "bin", exe);
    if (existsSync(proto) && canDlopenSqlite(proto, repoRoot)) return proto;
  }
  if (existsSync(pinned)) return pinned;
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

/**
 * The Dashboard binds one port. Anything else — a recorded listener on a
 * different port, or a canonical port that is not already this Dashboard —
 * is closed so a second server cannot stay up.
 */
export function dashboardPortsToClose(input: {
  readonly canonical: number;
  readonly recorded?: number | undefined;
  readonly canonicalLive: boolean;
}): readonly number[] {
  const ports = new Set<number>();
  if (
    typeof input.recorded === "number" &&
    input.recorded > 0 &&
    input.recorded !== input.canonical
  ) {
    ports.add(input.recorded);
  }
  if (input.canonical > 0 && !input.canonicalLive) {
    ports.add(input.canonical);
  }
  return [...ports];
}

/** `lsof -F pcPn` records: pid, command name, then each listen address. */
export function parseLsofListenFields(
  stdout: string,
): { readonly pid: number; readonly command: string; readonly port: number }[] {
  const rows: {
    pid: number;
    command: string;
    port: number;
  }[] = [];
  let pid = 0;
  let command = "";
  for (const line of stdout.split("\n")) {
    if (line.startsWith("p")) {
      pid = Number.parseInt(line.slice(1), 10);
      command = "";
    } else if (line.startsWith("c")) {
      command = line.slice(1);
    } else if (line.startsWith("n") && Number.isInteger(pid) && pid > 0) {
      const match = /:(\d+)$/.exec(line.slice(1));
      if (!match) continue;
      const port = Number.parseInt(match[1] ?? "", 10);
      if (port > 0) rows.push({ pid, command, port });
    }
  }
  return rows;
}

/** A Vite playground on any port other than the one Dashboard port. */
export function isStrayPlaygroundListener(
  command: string,
  port: number,
  canonical: number,
): boolean {
  if (port <= 0 || port === canonical) return false;
  return /vite/i.test(command) && /playground/i.test(command);
}

async function listenFieldStdout(): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "lsof",
      ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcPn"],
      { timeout: 2000 },
    );
    return stdout;
  } catch (cause) {
    const stdout = (cause as { stdout?: string }).stdout;
    return typeof stdout === "string" ? stdout : "";
  }
}

async function processArgs(pid: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-p", String(pid), "-o", "args="],
      { timeout: 1500 },
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

/** Playground Vite processes listening somewhere other than `canonical`. */
export async function strayPlaygroundPorts(
  canonical: number,
): Promise<number[]> {
  const ports = new Set<number>();
  for (const row of parseLsofListenFields(await listenFieldStdout())) {
    if (!/^(node|bun)$/.test(row.command)) continue;
    const args = await processArgs(row.pid);
    if (isStrayPlaygroundListener(args, row.port, canonical))
      ports.add(row.port);
  }
  return [...ports];
}

/**
 * Free every Dashboard listener that is not the live server on `canonical`.
 * The live server on that port is left alone.
 */
export async function releaseDashboardPort(
  canonical: number,
  env: HubEnv = process.env,
): Promise<void> {
  // The suite binds ephemeral ports. It must not close the user's Dashboard.
  if (env.VITEST === "true" || process.env.VITEST === "true") return;
  if (canonical <= 0) return;
  const record = await readPlaygroundRecord(env);
  const canonicalLive = await playgroundIsLive(canonical);
  const ports = new Set(
    dashboardPortsToClose({
      canonical,
      recorded: record?.port,
      canonicalLive,
    }),
  );
  for (const port of await strayPlaygroundPorts(canonical)) ports.add(port);
  for (const port of ports) {
    await stopPlaygroundListeners(
      port,
      record?.port === port ? record.pid : undefined,
    );
  }
  if (ports.size > 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, 80).unref?.();
    });
  }
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
