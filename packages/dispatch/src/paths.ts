import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { DISPATCH_DIR } from "./types.js";

export function dispatchDir(workspaceRoot: string): string {
  return join(workspaceRoot, DISPATCH_DIR);
}

export function configPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "config.json");
}

/** Pre-ADR-0054 location: `{repo}/.prism/dispatch/jobs.json`. */
export function legacyJobsPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "jobs.json");
}

/**
 * Job records live under `~/.prism/dispatch/workspaces/<key>/` (ADR-0054).
 *
 * Vitest fixtures keep writing into the temp repo unless they set
 * `PRISM_HOME`, so the suite does not touch the developer's real library.
 */
export function useGlobalJobStore(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.PRISM_JOBS_LOCAL === "1") return false;
  if (env.VITEST === "true" && !env.PRISM_HOME?.trim()) return false;
  return true;
}

export function workspaceJobKey(workspaceRoot: string): string {
  return createHash("sha256")
    .update(resolve(workspaceRoot))
    .digest("hex")
    .slice(0, 24);
}

export function globalWorkspacesDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(prismHome(env), "dispatch", "workspaces");
}

export function globalWorkspaceDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(globalWorkspacesDir(env), workspaceJobKey(workspaceRoot));
}

export function jobsPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!useGlobalJobStore(env)) return legacyJobsPath(workspaceRoot);
  return join(globalWorkspaceDir(workspaceRoot, env), "jobs.json");
}

export function jobsMetaPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(globalWorkspaceDir(workspaceRoot, env), "meta.json");
}

export function memoryPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "memory.json");
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

/**
 * The worker's own `mcp.json`, holding only worker-role Prism (ADR-0050).
 *
 * Per job rather than shared: two jobs can be resolved against different
 * workspace roots, and a shared file would give the second one the first one's
 * repository.
 */
export function workerMcpConfigPath(
  workspaceRoot: string,
  jobId: string,
): string {
  return join(runsDir(workspaceRoot), `${runFileId(jobId)}.mcp.json`);
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

/**
 * Machine-wide Prism dir (`~/.prism`). Override with `PRISM_HOME`.
 *
 * Job records live here under `dispatch/workspaces/` (ADR-0054). Git
 * worktrees, run logs and notes stay in the repo (ADR-0043 / ADR-0053). The
 * Cursor SDK agent catalog is not a repo artifact — it belongs here so a
 * Dispatch run does not write hundreds of megabytes into the tree.
 */
export function prismHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PRISM_HOME?.trim();
  if (override) return override;
  return join(homedir(), ".prism");
}

/** Cursor SDK `JsonlLocalAgentStore` root — never `<repo>/.prism/dispatch`. */
export function agentStoreDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHome(env), "dispatch", "agent-store");
}
