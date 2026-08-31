/**
 * Where the server looks for the repository it should analyse (M-026).
 *
 * Agents launch us with a working directory we did not choose. Explicit wins:
 * argument → `PRISM_WORKSPACE` → host workspace folders → nearest git root
 * from cwd → host launch cwd (`VSCODE_CWD` / `INIT_CWD` when they contain a
 * git root) → cwd.
 *
 * Cursor (and VS Code) often spawn MCP from the editor user folder, not the
 * open project. `WORKSPACE_FOLDER_PATHS` is the host's real workspace list;
 * without it, Dispatch's `git worktree` calls fail with "not a git repository".
 */

import { existsSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Precedence order, most explicit first. */
export type WorkspaceSource =
  | "argument"
  | "environment"
  | "WORKSPACE_FOLDER_PATHS"
  | "CURSOR_WORKSPACE"
  | "VSCODE_CWD"
  | "INIT_CWD"
  | "git root"
  | "cwd";

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
  /** Process env — used for host workspace hints. */
  readonly env?: NodeJS.ProcessEnv | undefined;
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

function absolute(path: string, cwd: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

/** Accept `file://` URIs from MCP-style hosts; leave ordinary paths alone. */
export function pathFromHint(value: string, cwd: string): string {
  const text = value.trim();
  if (text.startsWith("file:")) {
    try {
      return fileURLToPath(text);
    } catch {
      /* fall through */
    }
  }
  return absolute(text, cwd);
}

/**
 * Split a host search path (`WORKSPACE_FOLDER_PATHS`) on the OS delimiter.
 * Empty segments are dropped.
 */
export function splitHostPaths(value: string | undefined): string[] {
  const text = trimmed(value);
  if (text === undefined) return [];
  return text
    .split(delimiter)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function existingPath(hint: string, cwd: string): string | undefined {
  const path = pathFromHint(hint, cwd);
  return existsSync(path) ? path : undefined;
}

function existingGitRoot(hint: string, cwd: string): string | undefined {
  const path = existingPath(hint, cwd);
  return path === undefined ? undefined : findGitRoot(path);
}

/**
 * Cursor / VS Code often start MCP inside the editor sandbox (macOS
 * `Library/Containers/…`, app support folders, npx cache). Those directories
 * exist and are not git repos — never treat them as the project.
 */
export function isEditorSandboxPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return (
    normalized.includes("/Library/Containers/") ||
    normalized.includes("/Library/Application Support/Cursor") ||
    normalized.includes("/Library/Application Support/Code") ||
    normalized.includes("/.cursor-server/") ||
    normalized.includes("/.npm/_npx/") ||
    normalized.includes("/npm/_npx/") ||
    normalized.includes("/AppData/Roaming/Cursor") ||
    normalized.includes("/AppData/Roaming/Code") ||
    normalized.includes("/AppData/Local/npm-cache/_npx")
  );
}

/**
 * Resolve the workspace root: argument → `PRISM_WORKSPACE` → host folders →
 * git root from cwd → git root from launch cwd → cwd.
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

  const env = input.env ?? {};
  const folderHints = splitHostPaths(env.WORKSPACE_FOLDER_PATHS);
  for (const hint of folderHints) {
    const path = existingGitRoot(hint, input.cwd);
    if (path === undefined) continue;
    return { path, source: "WORKSPACE_FOLDER_PATHS" };
  }

  const cursorWorkspace = trimmed(env.CURSOR_WORKSPACE);
  if (cursorWorkspace !== undefined) {
    const path = existingGitRoot(cursorWorkspace, input.cwd);
    if (path !== undefined) {
      return { path, source: "CURSOR_WORKSPACE" };
    }
  }

  const gitRoot = findGitRoot(input.cwd);
  if (gitRoot !== undefined) {
    return { path: gitRoot, source: "git root" };
  }

  const vscodeCwd = trimmed(env.VSCODE_CWD);
  if (vscodeCwd !== undefined) {
    const path = existingGitRoot(vscodeCwd, input.cwd);
    if (path !== undefined) {
      return { path, source: "VSCODE_CWD" };
    }
  }

  const initCwd = trimmed(env.INIT_CWD);
  if (initCwd !== undefined) {
    const path = existingGitRoot(initCwd, input.cwd);
    if (path !== undefined) {
      return { path, source: "INIT_CWD" };
    }
  }

  return { path: absolute(input.cwd, input.cwd), source: "cwd" };
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
