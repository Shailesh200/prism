import {
  commitJobWork,
  defaultGitRunner,
  discoverWorktrees,
  gitDirtyPaths,
  mergeJobBranch,
  removeGitWorktree,
} from "@repo-prism/dispatch";
import { resolve } from "node:path";

type TreeJob = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly worktreePath?: string;
  readonly workspacePath?: string;
};

export type TreeKind = "primary" | "linked";

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
  return resolve(a) === resolve(b);
}

export async function collectRepoTrees(input: {
  readonly workspacePath: string;
  readonly label: string;
  readonly jobs: readonly TreeJob[];
}): Promise<RepoTrees> {
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
  const trees: RepoTree[] = [];
  for (const tree of listed) {
    const kind: TreeKind = samePath(tree.path, input.workspacePath)
      ? "primary"
      : "linked";
    const files = await gitDirtyPaths(tree.path).catch(() => [] as string[]);
    const matches = input.jobs.filter((row) => {
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
      jobs: matches.slice(0, 8).map((row) => ({
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
  }
  trees.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "primary" ? -1 : 1;
    return a.branch.localeCompare(b.branch);
  });
  return { path: input.workspacePath, label: input.label, trees };
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
