import {
  ensureWorkspacePrism,
  legacyGlobalJobsDir,
  legacyRepoPrismDir,
  prismHomeDir,
  removeLeftoverRepoPrism,
  useLocalPrismStore,
  workspaceDispatchDir,
  workspaceKey,
  workspacePrismDir,
} from "@repo-prism/shared/prism-home";
import { join } from "node:path";

export function dispatchDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return workspaceDispatchDir(workspaceRoot, env);
}

export function configPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "config.json");
}

/** Pre-ADR-0054 location: `{repo}/.prism/dispatch/jobs.json`. */
export function legacyJobsPath(workspaceRoot: string): string {
  return join(legacyRepoPrismDir(workspaceRoot), "dispatch", "jobs.json");
}

/**
 * Job records live under `~/.prism/workspaces/<key>/dispatch/`.
 * Vitest fixtures without `PRISM_HOME` still write `{repo}/.prism`.
 */
export function useGlobalJobStore(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !useLocalPrismStore(env);
}

export function workspaceJobKey(workspaceRoot: string): string {
  return workspaceKey(workspaceRoot);
}

export function globalWorkspacesDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(prismHome(env), "workspaces");
}

export function globalWorkspaceDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return workspacePrismDir(workspaceRoot, env);
}

export function jobsPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspaceDispatchDir(workspaceRoot, env), "jobs.json");
}

export function jobsMetaPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspaceDispatchDir(workspaceRoot, env), "meta.json");
}

export function memoryPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(dispatchDir(workspaceRoot, env), "memory.json");
}

export function worktreesDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(dispatchDir(workspaceRoot, env), "worktrees");
}

export function runsDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(dispatchDir(workspaceRoot, env), "runs");
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

export function consentPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "consent.json");
}

/**
 * Machine-wide Prism dir (`~/.prism`). Override with `PRISM_HOME`.
 *
 * Per-repo state (jobs, cache, consent, run logs, worktrees) lives under
 * `workspaces/<key>/`. The Cursor SDK agent catalog stays in
 * `dispatch/agent-store` so a run does not write hundreds of megabytes
 * into a checkout.
 */
export function prismHome(env: NodeJS.ProcessEnv = process.env): string {
  return prismHomeDir(env);
}

export { ensureWorkspacePrism, legacyGlobalJobsDir, removeLeftoverRepoPrism };

/** Cursor SDK `JsonlLocalAgentStore` root — never `<repo>/.prism/dispatch`. */
export function agentStoreDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHome(env), "dispatch", "agent-store");
}
