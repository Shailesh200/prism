/**
 * Checkouts Prism has already indexed.
 *
 * Each repo's index lives in `~/.prism/workspaces/<key>/cache/index.sqlite`.
 * The key is a hash of the checkout path, and the path itself is stored in
 * that database. A pull-request review reads it back so it can open the
 * checkout it already knows, instead of cloning.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { openSqliteDatabase } from "@repo-prism/indexer";
import { prismHomeDir } from "./prism-home.js";

export type IndexedWorkspace = {
  readonly root: string;
  /** `indexed_at` from the cache, or 0 when it cannot be parsed. */
  readonly indexedAt: number;
};

export function listIndexedWorkspaces(
  env: NodeJS.ProcessEnv = process.env,
): readonly IndexedWorkspace[] {
  const dir = join(prismHomeDir(env), "workspaces");
  if (!existsSync(dir)) return [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const found: IndexedWorkspace[] = [];
  for (const name of names) {
    const dbPath = join(dir, name, "cache", "index.sqlite");
    if (!existsSync(dbPath)) continue;
    let db: ReturnType<typeof openSqliteDatabase> | undefined;
    try {
      db = openSqliteDatabase(dbPath);
      const row = db
        .prepare("SELECT root_path, indexed_at FROM index_meta LIMIT 1")
        .get() as { root_path?: string; indexed_at?: string } | undefined;
      if (!row?.root_path) continue;
      const indexedAt = Date.parse(row.indexed_at ?? "");
      found.push({
        root: row.root_path,
        indexedAt: Number.isFinite(indexedAt) ? indexedAt : 0,
      });
    } catch {
      continue;
    } finally {
      try {
        db?.close();
      } catch {
        // A cache that cannot be closed is skipped with the rest.
      }
    }
  }
  return found;
}
