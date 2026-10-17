/**
 * Attach-first client side (M-095, ADR-0063). Kept apart from `daemon.ts`
 * so a hook can ask the daemon without loading every tool definition.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  callDaemonTool,
  daemonBuildIdFor,
  daemonEnabled,
  type DaemonOutcome,
  ensureDaemon,
  warmDaemonWorkspace,
} from "@repo-prism/daemon";
import { readPackageVersion } from "./branding.js";
import { recordEvent } from "@repo-prism/shared/events";

const here = fileURLToPath(import.meta.url);

let cachedBuildId: string | undefined;

/**
 * Version plus the build time of this file. `dev:link` rebuilds without a
 * version bump, and a daemon left over from the previous build must not answer.
 */
export function daemonBuildId(): string {
  if (cachedBuildId) return cachedBuildId;
  // Same derivation as the CLI's, so `prism start` can replace a stale daemon.
  const id = daemonBuildIdFor(here);
  if (!id) {
    // An unreadable stamp still yields a stable id for this process.
    recordEvent({
      event: "daemon.build_stamp",
      outcome: "degraded",
      reason: "build stamp unreadable",
    });
  }
  cachedBuildId = id ?? `${readPackageVersion()}+0`;
  return cachedBuildId;
}

/** How to start a daemon from this build. */
export function daemonCommand(): { command: string; args: string[] } {
  return {
    command: process.execPath,
    args: [join(dirname(here), "bin.js"), "--daemon"],
  };
}

export type Attach = (
  tool: string,
  root: string,
  args: unknown,
  timeoutMs?: number,
) => Promise<DaemonOutcome<unknown>>;

/** Undefined when the daemon is switched off, so callers skip it entirely. */
export function daemonAttach(
  env: NodeJS.ProcessEnv = process.env,
): Attach | undefined {
  if (!daemonEnabled(env)) return undefined;
  return (tool, root, args, timeoutMs) =>
    callDaemonTool({
      root,
      tool,
      args,
      env,
      buildId: daemonBuildId(),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
}

/** Start a daemon from this build if none answers, and ask it to index `root`. */
export async function startDaemonFor(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!daemonEnabled(env)) return;
  const started = await ensureDaemon({
    ...daemonCommand(),
    env,
    buildId: daemonBuildId(),
  });
  if (started.kind === "ok") {
    await warmDaemonWorkspace({ root, env, buildId: daemonBuildId() });
  }
}
