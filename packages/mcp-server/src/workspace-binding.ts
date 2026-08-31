/**
 * Live workspace root for a long-lived MCP process.
 *
 * Startup can only see argv / env / cwd. Cursor often starts us from the
 * editor folder, so that first guess is not the repo the user is chatting in.
 * After initialize the client can answer `roots/list` with the open folders —
 * that is the path Dispatch and Intelligence should use, unless the user set
 * `--workspace` or `PRISM_WORKSPACE`.
 */

import { existsSync } from "node:fs";
import {
  findGitRoot,
  isEditorSandboxPath,
  pathFromHint,
  type ResolvedWorkspace,
  type WorkspaceSource,
} from "./workspace-resolution.js";

export type LiveWorkspaceSource = WorkspaceSource | "mcp roots";

export type WorkspaceBinding = {
  current(): string;
  source(): LiveWorkspaceSource;
  readonly locked: boolean;
  /** Prefer these directories (MCP roots). Returns true when the root changed. */
  applyHints(hints: readonly string[], source?: LiveWorkspaceSource): boolean;
};

const LOCKED_SOURCES = new Set<WorkspaceSource>(["argument", "environment"]);

export function createWorkspaceBinding(
  initial: ResolvedWorkspace,
  locked = LOCKED_SOURCES.has(initial.source),
): WorkspaceBinding {
  let path = initial.path;
  let source: LiveWorkspaceSource = initial.source;

  return {
    locked,
    current: () => path,
    source: () => source,
    applyHints(hints, nextSource = "mcp roots") {
      if (locked) return false;
      const picked = pickWorkspaceFromHints(hints);
      if (picked === undefined || picked === path) return false;
      path = picked;
      source = nextSource;
      return true;
    },
  };
}

/**
 * First existing hint that sits in a git repo wins. Editor sandbox folders
 * (Cursor's `Library/Containers` home, npx cache) are ignored even if they
 * exist. We never fall back to a non-git directory — that is how Dispatch
 * used to bind to the Mac container path and fail `git worktree`.
 */
export function pickWorkspaceFromHints(
  hints: readonly string[],
  cwd: string = process.cwd(),
): string | undefined {
  for (const hint of hints) {
    const text = hint.trim();
    if (!text) continue;
    const resolved = pathFromHint(text, cwd);
    if (!existsSync(resolved) || isEditorSandboxPath(resolved)) continue;
    const gitRoot = findGitRoot(resolved);
    if (gitRoot !== undefined && !isEditorSandboxPath(gitRoot)) return gitRoot;
  }
  return undefined;
}
