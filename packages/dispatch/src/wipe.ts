/**
 * Factory-reset Prism's on-disk state (jobs, hub, skills, index, Envelope).
 *
 * Source code and git history are not touched. After this, Prism looks like a
 * newly installed MCP: empty library, no Console session, no repo cache.
 */

import { realpath, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { listStoredWorkspaceRoots } from "./jobs.js";
import { prismHome } from "./paths.js";

export const WIPE_CONFIRM = "wipe";

export function confirmWipePhrase(value: string): boolean {
  return value.trim().toLowerCase() === WIPE_CONFIRM;
}

export function assertWipeHome(env: NodeJS.ProcessEnv = process.env): string {
  if (
    (env.VITEST === "true" || env.BUN_TEST === "1") &&
    !env.PRISM_HOME?.trim()
  ) {
    throw new Error("Refusing to wipe the default Prism library from tests.");
  }
  const home = resolve(prismHome(env));
  if (home === resolve("/") || home === resolve(homedir())) {
    throw new Error("Refusing to wipe that path.");
  }
  return home;
}

async function removeRepoPrism(root: string): Promise<boolean> {
  const dir = join(resolve(root), ".prism");
  if (basename(dir) !== ".prism") return false;
  try {
    const realDir = await realpath(dir);
    const realRoot = await realpath(root).catch(() => resolve(root));
    const prefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
    if (realDir !== join(realRoot, ".prism") && !realDir.startsWith(prefix)) {
      return false;
    }
    await rm(realDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export async function wipePrismData(
  extraRepoRoots: readonly string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ readonly home: string; readonly repos: readonly string[] }> {
  const home = assertWipeHome(env);
  const stored = await listStoredWorkspaceRoots(env);
  const roots = [
    ...new Set(
      [...extraRepoRoots, ...stored]
        .map((path) => resolve(path.trim()))
        .filter(Boolean),
    ),
  ];
  const repos: string[] = [];
  for (const root of roots) {
    if (await removeRepoPrism(root)) repos.push(root);
  }
  await rm(home, { recursive: true, force: true });
  return { home, repos };
}
