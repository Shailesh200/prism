/**
 * Where the server looks for the repository it should analyse (M-026).
 *
 * Agents launch us with a working directory we did not choose. Explicit wins:
 * argument → `PRISM_WORKSPACE` → nearest git root from cwd → cwd.
 *
 * Git-root discovery matches the CLI so users never have to paste an absolute
 * path: open a project in Cursor / Claude and the server analyses that repo.
 */

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/** Precedence order, most explicit first. */
export type WorkspaceSource = "argument" | "environment" | "git root" | "cwd";

export type ResolvedWorkspace = {
  /** Absolute path, resolved against `cwd` when the input was relative. */
  readonly path: string;
  readonly source: WorkspaceSource;
};

export type ResolveWorkspaceInput = {
  /** `--workspace <path>` or the first positional argument. */
  readonly argument?: string | undefined;
  /** `PRISM_WORKSPACE`. */
  readonly environment?: string | undefined;
  readonly cwd: string;
};

function trimmed(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Walk up from `start` looking for `.git`. Matches the CLI: worktrees and
 * submodules use a file rather than a directory, so existence is enough.
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

/**
 * Resolve the workspace root: argument → `PRISM_WORKSPACE` → git root → cwd.
 */
export function resolveWorkspacePath(
  input: ResolveWorkspaceInput,
): ResolvedWorkspace {
  const argument = trimmed(input.argument);
  if (argument !== undefined) {
    return { path: absolute(argument, input.cwd), source: "argument" };
  }

  const environment = trimmed(input.environment);
  if (environment !== undefined) {
    return { path: absolute(environment, input.cwd), source: "environment" };
  }

  const gitRoot = findGitRoot(input.cwd);
  if (gitRoot !== undefined) {
    return { path: gitRoot, source: "git root" };
  }

  return { path: absolute(input.cwd, input.cwd), source: "cwd" };
}

function absolute(path: string, cwd: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

/**
 * Read `--workspace <path>` / `--workspace=<path>`, falling back to the first
 * positional argument. Unknown flags are ignored: refusing to start over an
 * agent typo is worse than starting.
 */
export function workspaceArgFrom(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--workspace" || arg === "-w") {
      return argv[i + 1];
    }
    if (arg.startsWith("--workspace=")) {
      return arg.slice("--workspace=".length);
    }
  }

  return argv.find((arg) => !arg.startsWith("-"));
}
