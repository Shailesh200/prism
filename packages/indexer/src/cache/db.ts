import { mkdir, rm, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@repo-prism/shared";
import { migrate, readSchemaVersion, SCHEMA_VERSION } from "./migrations.js";
import { indexSqlitePath, prismCacheDir } from "./paths.js";

type SqliteDatabase = BetterSqlite3.Database;
type SqliteConstructor = typeof import("better-sqlite3");

type BunSqliteModule = {
  Database: new (
    filename: string,
    options?: { readonly create?: boolean },
  ) => SqliteDatabase;
};

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

/**
 * Resolve a native module from this package. Prefer `createRequire(import.meta.url)`
 * so Bun's global `require` (scoped to the playground Vite config) cannot miss
 * `better-sqlite3`. The CJS extension bundle still has a working `require`.
 */
function nativeRequire(specifier: string): unknown {
  if (typeof import.meta.url === "string") {
    try {
      return createRequire(import.meta.url)(specifier);
    } catch {
      /* CJS host / bun builtins fall through. */
    }
  }
  if (typeof require === "function") {
    return require(specifier);
  }
  throw new Error(`Cannot load ${specifier}`);
}

/**
 * better-sqlite3 exposes `db.pragma("journal_mode = WAL")`. bun:sqlite does
 * not — it is otherwise the same prepare/exec/transaction/close surface.
 */
function attachPragma(db: SqliteDatabase): SqliteDatabase {
  if (typeof db.pragma === "function") return db;
  Object.defineProperty(db, "pragma", {
    configurable: true,
    value(source: string): unknown {
      const sql = /^\s*pragma\b/i.test(source) ? source : `PRAGMA ${source}`;
      return db.prepare(sql).all();
    },
  });
  return db;
}

function openBunSqlite(path: string): SqliteDatabase {
  const mod = nativeRequire("bun:sqlite") as BunSqliteModule;
  const db =
    path === ":memory:"
      ? new mod.Database(path)
      : new mod.Database(path, { create: true });
  return attachPragma(db);
}

/**
 * Open SQLite. Node / the extension host use better-sqlite3 (ADR-0003).
 * Bun cannot dlopen that addon, so Bun-hosted hosts (playground Vite, MCP)
 * fall back to `bun:sqlite` — same file, same schema.
 */
export function openSqliteDatabase(path = ":memory:"): SqliteDatabase {
  try {
    const Database = nativeRequire("better-sqlite3") as SqliteConstructor;
    return attachPragma(new Database(path));
  } catch (cause) {
    if (!isBunRuntime()) throw cause;
    return openBunSqlite(path);
  }
}

export type IndexCacheDb = {
  readonly db: SqliteDatabase;
  readonly path: string;
  readonly schemaVersion: number;
  close(): void;
};

function ioError(message: string, details?: unknown): PrismError {
  return prismError(PrismErrorCode.IO_ERROR, message, details);
}

/**
 * Corruption check run on every open, so that a damaged cache is rebuilt rather
 * than surfaced as a stream of confusing query failures (ADR-0010).
 *
 * `quick_check` rather than `integrity_check`: the latter also verifies that
 * every index agrees with its table, which means a full scan. On a 75 MB cache
 * that measured 723 ms *per open*, and Core opens the cache more than once per
 * index — so it was costing more than a quarter of an incremental reindex to
 * re-verify a database written by the previous line of code (M-035).
 *
 * `quick_check` still detects the damage that actually happens here: truncated
 * writes, a half-flushed WAL, a file that is not a database. The failure it
 * gives up on — a corrupt index over intact rows — is both rarer and cheaper,
 * because the cache is derived data that is rebuilt rather than recovered.
 */
function isHealthy(db: SqliteDatabase): boolean {
  try {
    const row = db.prepare("PRAGMA quick_check").get() as
      | { quick_check: string }
      | undefined;
    return row?.quick_check === "ok";
  } catch {
    return false;
  }
}

async function removeDbFiles(dbPath: string): Promise<void> {
  await unlink(dbPath).catch(() => undefined);
  await unlink(`${dbPath}-wal`).catch(() => undefined);
  await unlink(`${dbPath}-shm`).catch(() => undefined);
}

/**
 * Open (or create) the workspace index SQLite DB.
 * Corrupt DBs are deleted and recreated (ADR-0010).
 */
export async function openIndexCache(
  workspaceRoot: string,
  options: { readonly dbPath?: string } = {},
): Promise<Result<IndexCacheDb, PrismError>> {
  const dbPath = options.dbPath ?? indexSqlitePath(workspaceRoot);

  try {
    await mkdir(dirname(dbPath), { recursive: true });
  } catch (cause) {
    return err(
      ioError(
        `Failed to create Prism cache directory: ${prismCacheDir(workspaceRoot)}`,
        {
          cause: String(cause),
        },
      ),
    );
  }

  const tryOpen = (rebuild: boolean): Result<IndexCacheDb, PrismError> => {
    try {
      const db = openSqliteDatabase(dbPath);
      db.pragma("journal_mode = WAL");
      if (!isHealthy(db)) {
        db.close();
        return err(ioError("SQLite quick_check failed", { path: dbPath }));
      }
      const schemaVersion = migrate(db);
      if (schemaVersion !== SCHEMA_VERSION && !rebuild) {
        // migrate should always reach SCHEMA_VERSION
      }
      return ok({
        db,
        path: dbPath,
        schemaVersion: readSchemaVersion(db),
        close() {
          db.close();
        },
      });
    } catch (cause) {
      return err(
        ioError(`Failed to open SQLite cache: ${dbPath}`, {
          cause: String(cause),
        }),
      );
    }
  };

  let opened = tryOpen(false);
  if (!opened.ok) {
    try {
      await removeDbFiles(dbPath);
    } catch (cause) {
      return err(
        ioError(`Failed to remove corrupt SQLite cache: ${dbPath}`, {
          cause: String(cause),
        }),
      );
    }
    opened = tryOpen(true);
    if (!opened.ok) return opened;
  }

  return opened;
}

/** Delete the entire `.prism/cache` directory (tests / recovery). */
export async function wipePrismCache(
  workspaceRoot: string,
): Promise<Result<true, PrismError>> {
  try {
    await rm(prismCacheDir(workspaceRoot), { recursive: true, force: true });
    return ok(true);
  } catch (cause) {
    return err(ioError("Failed to wipe Prism cache", { cause: String(cause) }));
  }
}
