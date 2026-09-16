/**
 * `~/.prism` home-directory paths shared outside `@repo-prism/dispatch`
 * (ADR-0054 workspace key). Dispatch keeps its own `prismHome`/job-key
 * helpers for `~/.prism/dispatch/workspaces/<key>/jobs.json`; this is the
 * sibling convention for non-job workspace state such as the generated
 * AGENTS.md — deliberately never written into the repo itself (M-073).
 */

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function prismHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PRISM_HOME?.trim();
  if (override) return override;
  return join(homedir(), ".prism");
}

/** Stable, filesystem-safe key for a workspace root (ADR-0054). */
export function workspaceKey(workspaceRoot: string): string {
  return createHash("sha256")
    .update(resolve(workspaceRoot))
    .digest("hex")
    .slice(0, 24);
}

export function workspaceStateDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(prismHomeDir(env), "workspaces", workspaceKey(workspaceRoot));
}

/** Never write here from inside the repo — `~/.prism` only (M-073 C3). */
export function agentsMdPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspaceStateDir(workspaceRoot, env), "agents.md");
}
