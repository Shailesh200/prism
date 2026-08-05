/**
 * Which repository the CLI acts on (M-028).
 *
 * Resolution order is `--workspace` → `PRISM_WORKSPACE` → the nearest ancestor
 * containing `.git` → cwd. Git-root discovery is the part users actually care
 * about: running `prism health` three directories deep should analyse the
 * repository, not the subdirectory, because that is what every other repo tool
 * does.
 */

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type WorkspaceSource =
  | "--workspace"
  | "PRISM_WORKSPACE"
  | "git root"
  | "cwd";

export type ResolvedWorkspace = {
  readonly path: string;
  readonly source: WorkspaceSource;
};

export type ResolveInput = {
  readonly flag?: string | undefined;
  readonly environment?: string | undefined;
  readonly cwd: string;
};

function trimmed(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function absolute(path: string, cwd: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

/**
 * Walk up from `start` looking for `.git`, returning the first directory that
 * has one. `.git` is a file rather than a directory in worktrees and submodules,
 * so existence is the test, not directory-ness.
 */
export function findGitRoot(start: string): string | undefined {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resolveWorkspace(input: ResolveInput): ResolvedWorkspace {
  const flag = trimmed(input.flag);
  if (flag !== undefined) {
    return { path: absolute(flag, input.cwd), source: "--workspace" };
  }

  const environment = trimmed(input.environment);
  if (environment !== undefined) {
    return {
      path: absolute(environment, input.cwd),
      source: "PRISM_WORKSPACE",
    };
  }

  const gitRoot = findGitRoot(input.cwd);
  if (gitRoot !== undefined) return { path: gitRoot, source: "git root" };

  return { path: resolve(input.cwd), source: "cwd" };
}
