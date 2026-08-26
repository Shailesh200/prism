import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { addGitWorktree, listGitWorktrees, type GitRunner } from "./git.js";
import { worktreesDir } from "./paths.js";
import type { WorktreeSource } from "./types.js";

export type DiscoveredWorktree = {
  path: string;
  branch: string;
  source: WorktreeSource;
  cursorAgentId?: string;
  claudeSession?: string;
};

function slugParts(jobId: string, title: string): string[] {
  const slug = `${jobId} ${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return [jobId.toLowerCase(), slug].filter(Boolean);
}

function matches(
  tree: { path: string; branch: string },
  needles: readonly string[],
): boolean {
  const hay = `${tree.branch} ${tree.path}`.toLowerCase();
  return needles.some((needle) => needle.length >= 3 && hay.includes(needle));
}

async function listDirIfPresent(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.map((name) => join(dir, name));
  } catch {
    return [];
  }
}

async function inferSource(
  path: string,
  workspaceRoot: string,
): Promise<{
  source: WorktreeSource;
  cursorAgentId?: string;
  claudeSession?: string;
}> {
  const prismPrefix = worktreesDir(workspaceRoot);
  if (path.startsWith(prismPrefix)) {
    return { source: "prism" };
  }
  try {
    const entries = await readdir(path);
    if (entries.includes(".claude")) {
      return { source: "claude", claudeSession: path };
    }
  } catch {
    /* ignore */
  }
  if (path.toLowerCase().includes("cursor") || path.includes(".cursor")) {
    return { source: "cursor" };
  }
  return { source: "cursor" };
}

export async function discoverWorktrees(
  workspaceRoot: string,
  run?: GitRunner,
): Promise<DiscoveredWorktree[]> {
  const listed = await listGitWorktrees(workspaceRoot, run);
  const extraRoots = [
    join(workspaceRoot, ".claude", "worktrees"),
    join(workspaceRoot, ".cursor", "worktrees"),
  ];
  const extra: DiscoveredWorktree[] = [];
  for (const root of extraRoots) {
    for (const path of await listDirIfPresent(root)) {
      try {
        const info = await stat(path);
        if (!info.isDirectory()) continue;
        if (listed.some((tree) => tree.path === path)) continue;
        extra.push({
          path,
          branch: "",
          ...(await inferSource(path, workspaceRoot)),
        });
      } catch {
        /* ignore */
      }
    }
  }
  const fromGit: DiscoveredWorktree[] = [];
  for (const tree of listed) {
    fromGit.push({
      path: tree.path,
      branch: tree.branch,
      ...(await inferSource(tree.path, workspaceRoot)),
    });
  }
  return [...fromGit, ...extra];
}

export async function adoptOrCreateWorktree(input: {
  readonly workspaceRoot: string;
  readonly jobId: string;
  readonly title: string;
  readonly preferredBranch?: string;
  readonly run?: GitRunner;
}): Promise<DiscoveredWorktree> {
  const needles = slugParts(input.jobId, input.title);
  const discovered = await discoverWorktrees(input.workspaceRoot, input.run);
  const match = discovered.find((tree) => matches(tree, needles));
  if (match) return match;

  const branch =
    input.preferredBranch?.trim() ||
    `dispatch/${input.jobId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const path = join(worktreesDir(input.workspaceRoot), input.jobId);
  const added = await addGitWorktree(
    input.workspaceRoot,
    path,
    branch,
    input.run,
  );
  if (!added.ok) {
    throw new Error(added.error ?? "failed to create worktree");
  }
  return { path, branch, source: "prism" };
}
