import { readFile } from "node:fs/promises";
import { daemonConfigPath } from "./paths.js";

export type DaemonConfig = {
  /** Exit after this long with no request. */
  readonly idleMinutes: number;
  /** Above this resident size the least recently used workspace is closed. */
  readonly maxMemoryMb: number;
  /** Process priority; higher is nicer to the foreground. */
  readonly nice: number;
  /** On battery below this percentage, reindexing pauses (Q-8). */
  readonly batteryPausePercent: number;
  /** Quiet period after the last file event before a reindex starts. */
  readonly debounceMs: number;
  /** Workspaces kept open at once; the least recently used one closes first. */
  readonly maxWorkspaces: number;
};

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  idleMinutes: 30,
  maxMemoryMb: 2048,
  nice: 10,
  batteryPausePercent: 20,
  debounceMs: 150,
  maxWorkspaces: 6,
};

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/** Unknown keys and bad values fall back to the defaults instead of failing startup. */
export function parseDaemonConfig(raw: unknown): DaemonConfig {
  const input =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = DEFAULT_DAEMON_CONFIG;
  return {
    idleMinutes: positive(input.idleMinutes, base.idleMinutes),
    maxMemoryMb: positive(input.maxMemoryMb, base.maxMemoryMb),
    nice: Math.min(19, Math.round(positive(input.nice, base.nice))),
    batteryPausePercent: Math.min(
      100,
      positive(input.batteryPausePercent, base.batteryPausePercent),
    ),
    debounceMs: positive(input.debounceMs, base.debounceMs),
    maxWorkspaces: Math.max(
      1,
      Math.round(positive(input.maxWorkspaces, base.maxWorkspaces)),
    ),
  };
}

export async function readDaemonConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<DaemonConfig> {
  try {
    return parseDaemonConfig(
      JSON.parse(await readFile(daemonConfigPath(env), "utf8")),
    );
  } catch {
    return DEFAULT_DAEMON_CONFIG;
  }
}
