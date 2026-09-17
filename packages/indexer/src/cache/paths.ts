import { join } from "node:path";
import { workspaceCacheDir } from "@repo-prism/shared/prism-home";

/** Per-repo cache — `~/.prism/workspaces/<key>/cache` outside tests. */
export function prismCacheDir(workspaceRoot: string): string {
  return workspaceCacheDir(workspaceRoot);
}

/** Default SQLite index database path. */
export function indexSqlitePath(workspaceRoot: string): string {
  return join(prismCacheDir(workspaceRoot), "index.sqlite");
}
