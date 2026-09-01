import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { DISPATCH_DIR } from "./types.js";

/**
 * Machine-wide Prism home.
 *
 * `PRISM_HOME` overrides (CI, tests). Workspaces under the OS temp dir
 * (vitest / bun test fixtures) get `{workspace}/.prism-home` so they do
 * not share the developer's real `~/.prism` or a sibling test. Production
 * is `~/.prism` (ADR-0047) — one file for every repo and every MCP host
 * (Cursor, Claude Code, Codex, Claude Desktop).
 */
export function prismHome(
  workspaceRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = (env.PRISM_HOME ?? process.env.PRISM_HOME)?.trim();
  if (override) return override;
  if (workspaceRoot && isTempWorkspace(workspaceRoot)) {
    return join(workspaceRoot, ".prism-home");
  }
  return join(homedir(), ".prism");
}

function isTempWorkspace(workspaceRoot: string): boolean {
  const tmp = tmpdir();
  return (
    workspaceRoot === tmp ||
    workspaceRoot.startsWith(`${tmp}/`) ||
    workspaceRoot.startsWith(`${tmp}\\`)
  );
}

/** Shared Dispatch files: config, user-scoped memories (ADR-0047). */
export function userDispatchDir(
  workspaceRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(prismHome(workspaceRoot, env), "dispatch");
}

export function dispatchDir(workspaceRoot: string): string {
  return join(workspaceRoot, DISPATCH_DIR);
}

/** User-global settings. `configure` writes here so every repo and MCP host sees it. */
export function configPath(
  workspaceRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(userDispatchDir(workspaceRoot, env), "config.json");
}

/** Pre-ADR-0047 location, read once to migrate. */
export function repoConfigPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "config.json");
}

export function jobsPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "jobs.json");
}

export function memoryPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "memory.json");
}

/** User-scoped memories, shared across repositories and MCP hosts (ADR-0047). */
export function userMemoryPath(
  workspaceRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(userDispatchDir(workspaceRoot, env), "memory.json");
}

export function secretsPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "secrets.json");
}

export function oauthAppsPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "oauth-apps.json");
}

export function worktreesDir(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "worktrees");
}

export function runsDir(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "runs");
}

export function runFileId(jobId: string): string {
  return jobId.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export function runStatePath(workspaceRoot: string, jobId: string): string {
  return join(runsDir(workspaceRoot), `${runFileId(jobId)}.json`);
}

export function spawnPayloadPath(workspaceRoot: string, jobId: string): string {
  return join(runsDir(workspaceRoot), `${runFileId(jobId)}.spawn.json`);
}

/** Append-only console log for one job (JSONL). */
export function runLogPath(workspaceRoot: string, jobId: string): string {
  return join(runsDir(workspaceRoot), `${runFileId(jobId)}.log.jsonl`);
}

/** Single previous generation, so one job is bounded at two files. */
export function rotatedRunLogPath(logPath: string): string {
  return `${logPath}.1`;
}

export function consentPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".prism", "consent.json");
}
