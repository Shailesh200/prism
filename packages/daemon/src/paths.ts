import { join } from "node:path";
import { prismHomeDir } from "@repo-prism/shared/prism-home";

/** Everything the daemon owns lives in one folder under `~/.prism`. */
export function daemonDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHomeDir(env), "daemon");
}

/** pid, port, token and build id of the running daemon. Mode 0600. */
export function daemonRecordPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(daemonDir(env), "daemon.json");
}

/** The one config file for limits (ADR-0063 §5). */
export function daemonConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(daemonDir(env), "config.json");
}

export function daemonLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(daemonDir(env), "daemon.log");
}

/**
 * `PRISM_DAEMON=0` turns attach and autostart off. The test suites never
 * reach a developer's real daemon unless a test opts in with `PRISM_DAEMON=1`.
 */
export function daemonEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PRISM_DAEMON === "0") return false;
  if (env.PRISM_DAEMON === "1") return true;
  if (env.VITEST === "true" || env.BUN_TEST === "1") return false;
  return true;
}
