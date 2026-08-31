import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitSnapshot, JobReview, ReviewFile } from "./types.js";

const execFileAsync = promisify(execFile);

export type GitRunner = (
  cwd: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string; ok: boolean }>;

/**
 * Hosts (Cursor, hooks, CI) sometimes export `GIT_DIR` / `GIT_WORK_TREE`.
 * Those override `cwd` and make a perfectly good repo look missing.
 */
export const GIT_OVERRIDE_ENV = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
] as const;

export function gitChildEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const key of GIT_OVERRIDE_ENV) {
    delete env[key];
  }
  return env;
}

export const defaultGitRunner: GitRunner = async (cwd, args) => {
  try {
    const result = await execFileAsync("git", ["-C", cwd, ...args], {
      cwd,
      env: gitChildEnv(),
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 2_000_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, ok: true };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "git failed",
      ok: false,
    };
  }
};

export function isMissingGitRepoMessage(detail: string): boolean {
  return /not a git repository/i.test(detail);
}

export async function gitSnapshot(
  workspaceRoot: string,
  run: GitRunner = defaultGitRunner,
): Promise<GitSnapshot> {
  const [branch, status, log, aheadBehind, yesterday, user] = await Promise.all(
    [
      run(workspaceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
      run(workspaceRoot, ["status", "--porcelain"]),
      run(workspaceRoot, ["log", "-5", "--pretty=format:%h %s"]),
      run(workspaceRoot, [
        "rev-list",
        "--left-right",
        "--count",
        "@{upstream}...HEAD",
      ]),
      run(workspaceRoot, [
        "log",
        "--since=yesterday",
        "--pretty=format:%h %s",
        "--no-merges",
      ]),
      run(workspaceRoot, ["config", "user.name"]),
    ],
  );

  if (!branch.ok) {
    return {
      branch: "(unknown)",
      dirtyCount: 0,
      dirtySample: [],
      recent: [],
      sinceYesterday: [],
      error: branch.stderr.trim() || "not a git repository",
    };
  }

  const dirtyLines = status.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !isGitNoiseStatusLine(line));
  let ahead: number | undefined;
  let behind: number | undefined;
  if (aheadBehind.ok) {
    const [left, right] = aheadBehind.stdout.trim().split(/\s+/);
    behind = Number.parseInt(left ?? "0", 10);
    ahead = Number.parseInt(right ?? "0", 10);
  }

  return {
    branch: branch.stdout.trim() || "HEAD",
    dirtyCount: dirtyLines.length,
    dirtySample: dirtyLines.slice(0, 8).map((line) => line.slice(3) || line),
    ...(Number.isFinite(ahead) ? { ahead } : {}),
    ...(Number.isFinite(behind) ? { behind } : {}),
    recent: log.ok
      ? log.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [],
    sinceYesterday: yesterday.ok
      ? yesterday.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 12)
      : [],
    ...(user.ok && user.stdout.trim()
      ? { userName: user.stdout.trim().split("\n")[0] }
      : {}),
  };
}

export async function gitStatusShort(
  cwd: string,
  run: GitRunner = defaultGitRunner,
): Promise<string> {
  const result = await run(cwd, ["status", "--short"]);
  if (!result.ok) return result.stderr.trim();
  return result.stdout
    .split("\n")
    .filter((line) => line.trim() && !isGitNoiseStatusLine(line))
    .join("\n")
    .trim();
}

function isGitNoisePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  return (
    normalized === "node_modules" ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized === ".prism" ||
    normalized.startsWith(".prism/")
  );
}

function isGitNoiseStatusLine(line: string): boolean {
  const path = line.slice(3).trim().split(" -> ").at(-1) ?? "";
  return isGitNoisePath(path);
}

/** One line for chat: what the worktree changed, without paths to the tree. */
export async function gitChangeSummary(
  cwd: string,
  run: GitRunner = defaultGitRunner,
): Promise<string> {
  const [stat, short] = await Promise.all([
    run(cwd, ["diff", "--stat"]),
    run(cwd, ["status", "--short"]),
  ]);
  const dirty = short.ok
    ? short.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !isGitNoiseStatusLine(line))
    : [];
  const statLines = stat.ok
    ? stat.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const totals = statLines.at(-1);
  if (totals && /\d+\s+file/.test(totals)) {
    return totals.replace(/\s+/g, " ");
  }
  if (dirty.length === 0) return "No file changes yet.";
  const names = dirty
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((name) => name.replace(/\\/g, "/").split("/").at(-1) ?? name);
  const extra =
    dirty.length > names.length
      ? ` (+${dirty.length - names.length} more)`
      : "";
  const noun = dirty.length === 1 ? "file" : "files";
  return `Changed ${dirty.length} ${noun}${names.length ? ` (${names.join(", ")}${extra})` : ""}.`;
}

/** Cap the review file list; a 500-file job is a summary, not a list. */
export const MAX_REVIEW_FILES = 50;

function reviewChangeFromStatus(code: string): ReviewFile["change"] {
  const flags = code.trim();
  if (flags.startsWith("??")) return "untracked";
  if (flags.startsWith("R")) return "renamed";
  if (flags.includes("D")) return "deleted";
  if (flags.startsWith("A")) return "added";
  return "modified";
}

/**
 * What the teammate changed, uncommitted, for the human to review.
 *
 * `--numstat` against HEAD covers tracked edits; `status --porcelain` adds
 * untracked files, which numstat cannot see and which are usually the new
 * files the job was asked to create.
 */
export async function gitReviewSummary(
  cwd: string,
  run: GitRunner = defaultGitRunner,
): Promise<JobReview> {
  const [numstat, status] = await Promise.all([
    run(cwd, ["diff", "--numstat", "HEAD"]),
    run(cwd, ["status", "--porcelain"]),
  ]);

  const byPath = new Map<string, ReviewFile>();

  if (numstat.ok) {
    for (const line of numstat.stdout.split("\n")) {
      const row = line.trim();
      if (!row) continue;
      const [addedRaw, removedRaw, ...pathParts] = row.split(/\t+/);
      const path = (pathParts.at(-1) ?? "").trim();
      if (!path || isGitNoisePath(path)) continue;
      // "-" is git's marker for a binary file.
      const added = Number.parseInt(addedRaw ?? "0", 10);
      const removed = Number.parseInt(removedRaw ?? "0", 10);
      byPath.set(path, {
        path,
        added: Number.isFinite(added) ? added : 0,
        removed: Number.isFinite(removed) ? removed : 0,
        change: "modified",
      });
    }
  }

  if (status.ok) {
    for (const line of status.stdout.split("\n")) {
      if (!line.trim() || isGitNoiseStatusLine(line)) continue;
      const code = line.slice(0, 2);
      const path = (line.slice(3).trim().split(" -> ").at(-1) ?? "").trim();
      if (!path || isGitNoisePath(path)) continue;
      const change = reviewChangeFromStatus(code);
      const existing = byPath.get(path);
      if (existing) {
        byPath.set(path, { ...existing, change });
      } else {
        byPath.set(path, { path, added: 0, removed: 0, change });
      }
    }
  }

  const all = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  const totalAdded = all.reduce((sum, file) => sum + file.added, 0);
  const totalRemoved = all.reduce((sum, file) => sum + file.removed, 0);

  return {
    files: all.slice(0, MAX_REVIEW_FILES),
    totalAdded,
    totalRemoved,
    truncated: all.length > MAX_REVIEW_FILES,
    committed: false,
  };
}

export type ListedWorktree = {
  path: string;
  branch: string;
  head: string;
};

export async function listGitWorktrees(
  workspaceRoot: string,
  run: GitRunner = defaultGitRunner,
): Promise<ListedWorktree[]> {
  const result = await run(workspaceRoot, ["worktree", "list", "--porcelain"]);
  if (!result.ok) return [];
  const trees: ListedWorktree[] = [];
  let current: Partial<ListedWorktree> = {};
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) {
        trees.push({
          path: current.path,
          branch: current.branch ?? "",
          head: current.head ?? "",
        });
      }
      current = { path: line.slice("worktree ".length).trim() };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      current.branch = line
        .slice("branch ".length)
        .replace(/^refs\/heads\//, "")
        .trim();
    } else if (line.trim() === "") {
      if (current.path) {
        trees.push({
          path: current.path,
          branch: current.branch ?? "",
          head: current.head ?? "",
        });
        current = {};
      }
    }
  }
  if (current.path) {
    trees.push({
      path: current.path,
      branch: current.branch ?? "",
      head: current.head ?? "",
    });
  }
  return trees;
}

export async function addGitWorktree(
  workspaceRoot: string,
  path: string,
  branch: string,
  run: GitRunner = defaultGitRunner,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await run(workspaceRoot, ["rev-parse", "--verify", branch]);
  if (existing.ok) {
    const checkout = await run(workspaceRoot, [
      "worktree",
      "add",
      path,
      branch,
    ]);
    return checkout.ok
      ? { ok: true }
      : { ok: false, error: checkout.stderr.trim() };
  }
  const created = await run(workspaceRoot, [
    "worktree",
    "add",
    "-b",
    branch,
    path,
  ]);
  return created.ok
    ? { ok: true }
    : { ok: false, error: created.stderr.trim() };
}
