import type Database from "better-sqlite3";

/** Current schema version after all migrations. */
export const SCHEMA_VERSION = 3;

type Migration = {
  readonly version: number;
  readonly up: (db: Database.Database) => void;
};

const migrations: readonly Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS index_meta (
          root_path TEXT PRIMARY KEY NOT NULL,
          repo_id TEXT NOT NULL,
          indexed_at TEXT NOT NULL,
          stats_json TEXT NOT NULL,
          warnings_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS indexed_files (
          root_path TEXT NOT NULL,
          path TEXT NOT NULL,
          content_hash TEXT,
          plugin_id TEXT,
          status TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (root_path, path)
        );

        CREATE INDEX IF NOT EXISTS indexed_files_hash_idx
          ON indexed_files (root_path, content_hash);
      `);
      db.prepare(
        `INSERT INTO schema_meta (key, value) VALUES ('version', '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run();
    },
  },
  {
    version: 2,
    up(db) {
      // Smoke migration target for M-008 DoD — provenance tag on meta rows.
      db.exec(
        `ALTER TABLE index_meta ADD COLUMN source TEXT NOT NULL DEFAULT 'local'`,
      );
      db.prepare(
        `INSERT INTO schema_meta (key, value) VALUES ('version', '2')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run();
    },
  },
  {
    version: 3,
    up(db) {
      // Health / region history for Trends (M-046 / ADR-0023).
      db.exec(`
        CREATE TABLE IF NOT EXISTS health_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo_root TEXT NOT NULL,
          at TEXT NOT NULL,
          commit_sha TEXT,
          payload_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS health_history_root_at_idx
          ON health_history (repo_root, at);

        CREATE UNIQUE INDEX IF NOT EXISTS health_history_root_sha_idx
          ON health_history (repo_root, commit_sha)
          WHERE commit_sha IS NOT NULL;
      `);
      db.prepare(
        `INSERT INTO schema_meta (key, value) VALUES ('version', '3')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run();
    },
  },
];

export function readSchemaVersion(db: Database.Database): number {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'`,
    )
    .get() as { name: string } | undefined;
  if (!table) return 0;
  const row = db
    .prepare(`SELECT value FROM schema_meta WHERE key = 'version'`)
    .get() as { value: string } | undefined;
  if (!row) return 0;
  const n = Number.parseInt(row.value, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Apply pending migrations in order (optionally stop at `maxVersion`). */
export function migrate(
  db: Database.Database,
  options: { readonly maxVersion?: number } = {},
): number {
  const maxVersion = options.maxVersion ?? SCHEMA_VERSION;
  db.exec("PRAGMA foreign_keys = ON;");
  let current = readSchemaVersion(db);
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    if (migration.version > maxVersion) break;
    const tx = db.transaction(() => {
      migration.up(db);
    });
    tx();
    current = migration.version;
  }
  return current;
}
