import type Database from "better-sqlite3";

/**
 * Prism 2.0 index cache schema. 2.0 starts from a fresh schema v1 (plan §0.4
 * #15): a 1.x cache is never migrated. It is dropped and rebuilt from source,
 * because every row in it is derived data.
 */
export const SCHEMA_VERSION = 1;

/**
 * Version of what the analyzer extracts into `payload_json`. Bump it whenever
 * the analyzer's output changes meaning (a new field such as `typeOnly`, a
 * different symbol rule): cached rows are reused by content hash alone, so
 * without this a stale extraction would survive every re-index. A mismatch
 * clears the derived rows; the schema itself is unchanged.
 *
 * 2 — imports/re-exports carry `typeOnly` (plan §4.1).
 * 3 — imports carry `imported`, re-exports `importedName` (plan §4.2).
 * 4 — namespace imports narrowed to the members read (plan §4.2/§4.3).
 */
export const EXTRACTION_VERSION = 4;

/** Marks a cache written by Prism 2.x. A cache without it is 1.x data. */
export const SCHEMA_GENERATION = "2";

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
          warnings_json TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'local'
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
      const set = db.prepare(
        `INSERT INTO schema_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      );
      set.run("version", "1");
      set.run("generation", SCHEMA_GENERATION);
    },
  },
];

function hasSchemaMeta(db: Database.Database): boolean {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'`,
    )
    .get() as { name: string } | undefined;
  return table !== undefined;
}

function readMeta(db: Database.Database, key: string): string | undefined {
  const row = db
    .prepare(`SELECT value FROM schema_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function readSchemaVersion(db: Database.Database): number {
  if (!hasSchemaMeta(db)) return 0;
  if (readMeta(db, "generation") !== SCHEMA_GENERATION) return 0;
  const n = Number.parseInt(readMeta(db, "version") ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * True when the database holds tables but no 2.x generation marker: a 1.x
 * cache (or a foreign file) that must be rebuilt, never read.
 */
export function isLegacySchema(db: Database.Database): boolean {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as { name: string }[];
  if (tables.length === 0) return false;
  if (!hasSchemaMeta(db)) return true;
  return readMeta(db, "generation") !== SCHEMA_GENERATION;
}

function dropAllTables(db: Database.Database): void {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as { name: string }[];
  for (const { name } of tables) {
    db.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}"`);
  }
}

export type MigrateOptions = {
  readonly maxVersion?: number;
  /** Called once when a 1.x cache was dropped so the caller can log it. */
  readonly onLegacyReset?: () => void;
  /** Called when cached extractions were cleared for an EXTRACTION_VERSION change. */
  readonly onExtractionReset?: (from: string | null) => void;
};

/** Clear derived rows written by a different analyzer extraction version. */
function resetStaleExtraction(
  db: Database.Database,
  options: MigrateOptions,
): void {
  const row = db
    .prepare(`SELECT value FROM schema_meta WHERE key = 'extraction'`)
    .get() as { value: string } | undefined;
  const stored = row?.value ?? null;
  if (stored === String(EXTRACTION_VERSION)) return;
  db.transaction(() => {
    db.exec(`DELETE FROM indexed_files; DELETE FROM index_meta;`);
    db.prepare(
      `INSERT INTO schema_meta (key, value) VALUES ('extraction', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(EXTRACTION_VERSION));
  })();
  if (stored !== null) options.onExtractionReset?.(stored);
}

/** Apply pending migrations in order (optionally stop at `maxVersion`). */
export function migrate(
  db: Database.Database,
  options: MigrateOptions = {},
): number {
  const maxVersion = options.maxVersion ?? SCHEMA_VERSION;
  db.exec("PRAGMA foreign_keys = ON;");
  if (isLegacySchema(db)) {
    db.transaction(() => dropAllTables(db))();
    options.onLegacyReset?.();
  }
  let current = readSchemaVersion(db);
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    if (migration.version > maxVersion) break;
    db.transaction(() => migration.up(db))();
    current = migration.version;
  }
  if (current >= 1) resetStaleExtraction(db, options);
  return current;
}
