/**
 * Which files have changed, for `reviewChanges` (M-029).
 *
 * Editors know this already — VS Code hands the extension its SCM selection —
 * but a terminal does not, and a CLI that made the user paste a file list would
 * be answering a different question from the one they asked. The plumbing lives
 * here beside the other git readers rather than in `@prism/cli`, so every
 * surface computes "changed" the same way.
 *
 * Local git only. No network, no fetch, no remote resolution.
 */

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export type ChangedPaths = {
  /** What the diff was taken against: `"working tree"` or a git revision. */
  readonly base: string;
  /** Workspace-relative paths, sorted, deduplicated. */
  readonly paths: readonly string[];
};

function git(rootPath: string, args: readonly string[]): string | null {
  try {
    return execFileSync("git", ["-C", rootPath, ...args], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 15_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/**
 * Changed files under `rootPath`.
 *
 * With no `base`, this is everything uncommitted: staged, unstaged and
 * untracked. Untracked files are included deliberately — a new file nothing
 * imports yet is exactly the kind of change a review should notice, and
 * omitting it would make `prism review` quietly incomplete on a fresh branch.
 *
 * With a `base`, it is the diff against that revision, which is what a CI job
 * comparing a branch to `origin/main` wants.
 *
 * Returns `null` when the path is not a git work tree or `git` is missing, so
 * callers can say "I cannot tell what changed" rather than "nothing changed".
 * Those are different answers and only one of them is safe to act on.
 */
export function readChangedPaths(
  rootPath: string,
  options: { readonly base?: string } = {},
): ChangedPaths | null {
  const inside = git(rootPath, ["rev-parse", "--is-inside-work-tree"]);
  if (inside?.trim() !== "true") return null;

  // A workspace can sit *inside* a larger repository — a fixture, a package
  // opened on its own. Git reports the whole repository regardless of where it
  // was invoked, so without this the answer to "what changed here?" would be a
  // list of files that are not even in the workspace.
  const toplevel = git(rootPath, ["rev-parse", "--show-toplevel"])?.trim();
  if (!toplevel) return null;

  const raw = options.base
    ? git(rootPath, [
        "diff",
        "--name-only",
        "--no-renames",
        `${options.base}...HEAD`,
      ])
    : // `--porcelain` is the documented stable format; `--short` is not.
      parsePorcelain(
        git(rootPath, ["status", "--porcelain=v1", "--untracked-files=all"]) ??
          "",
      );
  if (raw === null) return null;

  return {
    base: options.base ?? "working tree",
    paths: scopeToWorkspace(normalize(raw), toplevel, rootPath),
  };
}

/**
 * Git reports paths relative to the repository root. Re-express them relative
 * to the workspace and drop anything outside it.
 */
function scopeToWorkspace(
  paths: readonly string[],
  toplevel: string,
  rootPath: string,
): readonly string[] {
  // Compared through realpath: git resolves symlinks and the caller usually
  // has not, so on macOS `/var/…` and `/private/var/…` are the same directory
  // spelled two ways. Without this every path looks like it is outside.
  const top = realPath(toplevel);
  const root = realPath(rootPath);
  if (top === root) return paths;

  const scoped: string[] = [];
  for (const path of paths) {
    const rel = relative(root, join(top, path));
    if (rel.startsWith("..") || isAbsolute(rel)) continue;
    scoped.push(rel.split("\\").join("/"));
  }
  return scoped;
}

function realPath(path: string): string {
  try {
    return realpathSync(resolve(path));
  } catch {
    return resolve(path);
  }
}

/**
 * Porcelain v1 lines are `XY <path>`, and renames are `XY <old> -> <new>`.
 * We take the destination: the old path no longer exists, so analysing it
 * would produce a report about a file that is not there.
 */
function parsePorcelain(status: string): string {
  return status
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => {
      const rest = line.slice(3);
      const arrow = rest.indexOf(" -> ");
      const path = arrow === -1 ? rest : rest.slice(arrow + 4);
      // Paths with unusual characters come back quoted.
      return path.startsWith('"') && path.endsWith('"')
        ? path.slice(1, -1)
        : path;
    })
    .join("\n");
}

function normalize(text: string): readonly string[] {
  return [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ].sort();
}
