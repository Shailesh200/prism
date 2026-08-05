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
} from "@prism/shared";
import { migrate, readSchemaVersion, SCHEMA_VERSION } from "./migrations.js";
import { indexSqlitePath, prismCacheDir } from "./paths.js";

type SqliteDatabase = BetterSqlite3.Database;
type SqliteConstructor = typeof import("better-sqlite3");

/** Lazy-load native binding so extension activate can register commands first. */
function loadSqlite(): SqliteConstructor {
  // Kept inside the function so the extension host does not dlopen
  // better-sqlite3 until an index cache is actually opened. `require` exists in
  // the CJS extension bundle; ESM consumers (CLI, MCP server, vitest) need
  // createRequire, which is why the plain call is not enough on its own.
  const load =
    typeof require === "function" ? require : createRequire(import.meta.url);
  return load("better-sqlite3") as SqliteConstructor;
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

function isHealthy(db: SqliteDatabase): boolean {
  try {
    const row = db.prepare("PRAGMA integrity_check").get() as
      | { integrity_check: string }
      | undefined;
    return row?.integrity_check === "ok";
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
      const Database = loadSqlite();
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");
      if (!isHealthy(db)) {
        db.close();
        return err(ioError("SQLite integrity_check failed", { path: dbPath }));
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
