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

export function consentPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".prism", "consent.json");
}
