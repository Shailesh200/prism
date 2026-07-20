import { join } from "node:path";

/** Workspace-local cache directory (ADR-0010). */
export function prismCacheDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".prism", "cache");
}

/** Default SQLite index database path. */
export function indexSqlitePath(workspaceRoot: string): string {
  return join(prismCacheDir(workspaceRoot), "index.sqlite");
}
