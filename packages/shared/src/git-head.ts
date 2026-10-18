/**
 * Reads HEAD's commit and branch straight from `.git`, without spawning git,
 * so a 300 ms hook can tell whether its snapshot still matches the checkout
 * (plan §2.4). Handles worktrees (`.git` file), symbolic and detached HEAD,
 * loose and packed refs. The plugin hook carries a zero-dependency copy.
 *
 * Import from `@repo-prism/shared/git-head`; this file uses `node:fs`.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export type GitHead = {
  readonly sha: string | null;
  readonly branch: string | null;
};

function read(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Absent, a directory where a file was expected, or a file in the path.
    if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR")
      return null;
    throw error;
  }
}

/** Returns null when `root` is not a git checkout. */
export function readGitHead(root: string): GitHead | null {
  let gitDir = join(root, ".git");
  const dotGit = read(gitDir);
  // A `.git` directory reads as null; a `.git` file names a worktree.
  if (dotGit !== null) {
    const match = /^gitdir:\s*(.+)\s*$/m.exec(dotGit);
    if (!match?.[1]) return null;
    gitDir = isAbsolute(match[1]) ? match[1] : resolve(root, match[1]);
  }
  return readHeadIn(gitDir);
}

function readHeadIn(gitDir: string): GitHead | null {
  const head = read(join(gitDir, "HEAD"));
  if (head === null) return null;
  const ref = /^ref:\s*(\S+)/.exec(head.trim());
  if (!ref?.[1]) return { sha: head.trim() || null, branch: null };
  const name = ref[1];
  const branch = name.startsWith("refs/heads/") ? name.slice(11) : name;
  // Worktrees keep refs in the common dir.
  const common = read(join(gitDir, "commondir"));
  const refDir = common ? resolve(gitDir, common.trim()) : gitDir;
  const loose = read(join(gitDir, name)) ?? read(join(refDir, name));
  if (loose) return { sha: loose.trim(), branch };
  const packed = read(join(refDir, "packed-refs"));
  for (const line of (packed ?? "").split("\n")) {
    const [sha, refName] = line.trim().split(" ");
    if (refName === name && sha) return { sha, branch };
  }
  return { sha: null, branch };
}
