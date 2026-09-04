import { join } from "node:path";
import { DISPATCH_DIR } from "./types.js";

export function dispatchDir(workspaceRoot: string): string {
  return join(workspaceRoot, DISPATCH_DIR);
}

export function configPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "config.json");
}

export function jobsPath(workspaceRoot: string): string {
  return join(dispatchDir(workspaceRoot), "jobs.json");
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
