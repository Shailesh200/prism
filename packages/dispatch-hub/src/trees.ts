import { resolve } from "node:path";
import {
  commitJobWork,
  defaultGitRunner,
  discoverWorktrees,
  gitDirtyPaths,
  isSkillPlaybook,
  mergeJobBranch,
  removeGitWorktree,
  sameWorktreePath,
} from "@repo-prism/dispatch";

type TreeJob = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly worktreePath?: string;
  readonly workspacePath?: string;
  readonly playbook?: string;
};

export type TreeKind = "primary" | "linked";

const TREE_JOB_RANK: Record<string, number> = {
  running: 0,
  booting: 0,
  ready: 0,
  queued: 1,
  needs_confirm: 1,
  paused: 2,
  waiting_on_you: 2,
  blocked: 2,
  failed: 3,
  error: 3,
  needs_review: 4,
  done: 5,
};

export function sortTreeJobs<T extends { readonly status: string }>(
  jobs: readonly T[],
): T[] {
  return [...jobs].sort((a, b) => {
    const rankA = TREE_JOB_RANK[a.status] ?? 6;
    const rankB = TREE_JOB_RANK[b.status] ?? 6;
    return rankA - rankB;
  });
}

function treeSortRank(tree: {
  readonly kind: TreeKind;
  readonly jobStatus?: string;
  readonly dirty: boolean;
}): number {
  if (tree.kind === "primary") return 0;
  const live =
    tree.jobStatus === "running" ||
    tree.jobStatus === "booting" ||
    tree.jobStatus === "ready";
  if (live) return 1;
  if (tree.dirty) return 2;
  return 3;
}

export type TreeJobRow = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
};

export type RepoTree = {
  readonly path: string;
  readonly branch: string;
  readonly source: string;
  readonly kind: TreeKind;
  readonly dirty: boolean;
  readonly files: number;
  readonly jobCount: number;
  readonly jobs: readonly TreeJobRow[];
  readonly jobId?: string;
  readonly jobTitle?: string;
  readonly jobStatus?: string;
};

export type RepoTrees = {
  readonly path: string;
  readonly label: string;
  readonly trees: readonly RepoTree[];
};

function samePath(a: string, b: string): boolean {
  return sameWorktreePath(a, b);
}

function isSkillTreeJob(job: TreeJob): boolean {
  if (isSkillPlaybook(job.playbook)) return true;
  return /^\s*skill:\s/i.test(job.title);
}

const TREE_CACHE_TTL_MS = 45_000;
const treeCache = new Map<string, { at: number; value: RepoTrees }>();

export function invalidateRepoTrees(workspacePath?: string): void {
  if (!workspacePath) {
    treeCache.clear();
    return;
  }
  treeCache.delete(resolve(workspacePath));
}

export async function collectRepoTrees(
  input: {
    readonly workspacePath: string;
    readonly label: string;
    readonly jobs: readonly TreeJob[];
  },
  opts?: { readonly force?: boolean },
): Promise<RepoTrees> {
  const key = resolve(input.workspacePath);
  const hit = treeCache.get(key);
  if (!opts?.force && hit && Date.now() - hit.at < TREE_CACHE_TTL_MS) {
    return hit.value;
  }
  const discovered = await discoverWorktrees(input.workspacePath);
  const listed =
    discovered.length > 0
      ? discovered
      : [
          {
            path: input.workspacePath,
            branch: "",
            source: "git" as const,
          },
        ];
  const dirtyLists = await Promise.all(
    listed.map((tree) => gitDirtyPaths(tree.path).catch(() => [] as string[])),
  );
  const trees: RepoTree[] = [];
  listed.forEach((tree, index) => {
    const kind: TreeKind = samePath(tree.path, input.workspacePath)
      ? "primary"
      : "linked";
    const files = dirtyLists[index] ?? [];
    const matches = input.jobs.filter((row) => {
      if (isSkillTreeJob(row)) return false;
      if (row.worktreePath) return samePath(row.worktreePath, tree.path);
      return (
        kind === "primary" &&
        Boolean(row.workspacePath) &&
        samePath(row.workspacePath!, input.workspacePath)
      );
    });
    const job =
      matches.find(
        (row) =>
          row.status === "running" ||
          row.status === "booting" ||
          row.status === "ready",
      ) ?? matches[0];
    trees.push({
      path: tree.path,
      branch: tree.branch,
      source: tree.source,
      kind,
      dirty: files.length > 0,
      files: files.length,
      jobCount: matches.length,
      jobs: sortTreeJobs(matches)
        .slice(0, 40)
        .map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
        })),
      ...(job
        ? {
            jobId: job.id,
            jobTitle: job.title,
            jobStatus: job.status,
          }
        : {}),
    });
  });
  trees.sort((a, b) => {
    const rank = treeSortRank(a) - treeSortRank(b);
    if (rank !== 0) return rank;
    return a.branch.localeCompare(b.branch);
  });
  const value = { path: input.workspacePath, label: input.label, trees };
  treeCache.set(key, { at: Date.now(), value });
  return value;
}

export async function runTreeAction(input: {
  readonly workspacePath: string;
  readonly treePath: string;
  readonly action: "merge" | "commit" | "push" | "remove";
  readonly branch?: string;
  readonly jobId?: string;
  readonly title?: string;
}): Promise<{ readonly ok: boolean; readonly detail: string }> {
  const tree = input.treePath.trim();
  if (!tree) return { ok: false, detail: "Missing worktree." };
  if (input.action === "remove") {
    if (samePath(tree, input.workspacePath)) {
      return { ok: false, detail: "The primary checkout cannot be removed." };
    }
    const ok = await removeGitWorktree(input.workspacePath, tree);
    return {
      ok,
      detail: ok ? "Removed the linked tree." : "Could not remove that tree.",
    };
  }
  if (input.action === "merge") {
    const branch = input.branch?.trim();
    if (!branch) return { ok: false, detail: "That tree has no branch." };
    const result = await mergeJobBranch(input.workspacePath, branch);
    return {
      ok: result.ok,
      detail: result.ok
        ? result.already
          ? `Already on ${result.into}.`
          : `Merged into ${result.into}.`
        : (result.error ?? "Merge failed."),
    };
  }
  if (input.action === "commit") {
    const result = await commitJobWork(tree, {
      jobId: input.jobId?.trim() || "tree",
      title: input.title?.trim() || input.branch?.trim() || "worktree",
    });
    return {
      ok: result.committed,
      detail: result.committed
        ? result.summary || "Committed."
        : "Nothing to commit.",
    };
  }
  const pushed = await defaultGitRunner(tree, ["push", "-u", "origin", "HEAD"]);
  return {
    ok: pushed.ok,
    detail: pushed.ok
      ? "Pushed this branch."
      : pushed.stderr.trim() || "Push failed.",
  };
}
