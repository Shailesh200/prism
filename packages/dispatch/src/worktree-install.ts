import { lstat, rm, stat, symlink } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { worktreesDir } from "./paths.js";

const INSTALL_DIR = "node_modules";

export function isPrismDispatchWorktree(
  workspaceRoot: string,
  worktreePath: string,
): boolean {
  const prefix = resolve(worktreesDir(workspaceRoot));
  const path = resolve(worktreePath);
  const rel = relative(prefix, path);
  return rel !== "" && !rel.startsWith("..") && !rel.includes("..");
}

/**
 * Point a Prism job worktree at the host install instead of letting the
 * teammate `bun install` a second copy (that filled the disk and hung the
 * laptop). Only touches trees under `.prism/dispatch/worktrees/`.
 */
export async function linkWorktreeInstall(input: {
  readonly workspaceRoot: string;
  readonly worktreePath: string;
}): Promise<{ linked: boolean; reason?: string }> {
  if (!isPrismDispatchWorktree(input.workspaceRoot, input.worktreePath)) {
    return { linked: false, reason: "not a Prism Dispatch worktree" };
  }
  const host = join(resolve(input.workspaceRoot), INSTALL_DIR);
  const target = join(resolve(input.worktreePath), INSTALL_DIR);
  let hostStat: Awaited<ReturnType<typeof stat>>;
  try {
    hostStat = await stat(host);
  } catch {
    return { linked: false, reason: "host has no node_modules" };
  }
  if (!hostStat.isDirectory()) {
    return { linked: false, reason: "host node_modules is not a directory" };
  }

  try {
    const existing = await lstat(target);
    if (existing.isSymbolicLink()) {
      return { linked: false, reason: "already linked" };
    }
    if (existing.isDirectory() || existing.isFile()) {
      await rm(target, { recursive: true, force: true });
    }
  } catch {
    /* missing — create the link */
  }

  await symlink(host, target, "dir");
  return { linked: true };
}
