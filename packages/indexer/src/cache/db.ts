import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { recordEvent } from "@repo-prism/shared/events";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
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

function requireFrom(base: string, specifier: string): unknown | undefined {
  try {
    const href = base.startsWith("file:") ? base : pathToFileURL(base).href;
    return createRequire(href)(specifier);
  } catch {
    return undefined;
  }
}

/**
 * Resolve a native module from this package. Vite bundles `vite.config.ts`
 * and rewrites `import.meta.url` to the playground, so a single
 * `createRequire(import.meta.url)` misses `packages/indexer/node_modules`.
 */
function nativeRequire(specifier: string): unknown {
  const loaded = requireFrom(import.meta.url, specifier);
  if (loaded !== undefined) return loaded;

  let dir = dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(join(dir, "node_modules", specifier))) {
      const hit = requireFrom(pkg, specifier);
      if (hit !== undefined) return hit;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  let cwd = process.cwd();
  for (let i = 0; i < 8; i++) {
    const indexerPkg = join(cwd, "packages/indexer/package.json");
    if (existsSync(indexerPkg)) {
      const hit = requireFrom(indexerPkg, specifier);
      if (hit !== undefined) return hit;
    }
    const parent = dirname(cwd);
    if (parent === cwd) break;
    cwd = parent;
  }

  if (typeof require === "function") {
    return require(specifier);
  }
  throw new Error(`Cannot load ${specifier} (from ${import.meta.url})`);
}

/** Driver/module failures are not cache corruption — do not delete the DB. */
export function isSqliteDriverError(cause: unknown): boolean {
  const text =
    cause instanceof Error ? `${cause.message} ${cause.name}` : String(cause);
  return /Cannot find module|Cannot load |MODULE_NOT_FOUND|dlopen|NODE_MODULE_VERSION|compiled against|ERR_DLOPEN|not a valid Win32|bun:sqlite/i.test(
    text,
  );
}

/**
 * `bun:sqlite` is a Bun builtin. Vite's `createRequire` cannot see it, so
 * playground Health-over-time used to fail open, delete the empty cache, and
 * surface "Failed to open SQLite cache".
 */
function loadBunSqlite(): BunSqliteModule {
  const getBuiltin = (process as { getBuiltinModule?: (id: string) => unknown })
    .getBuiltinModule;
  if (typeof getBuiltin === "function") {
    try {
      return getBuiltin("bun:sqlite") as BunSqliteModule;
    } catch {
      /* not a Bun builtin host */
    }
  }
  return nativeRequire("bun:sqlite") as BunSqliteModule;
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
  const mod = loadBunSqlite();
  const db =
    path === ":memory:"
      ? new mod.Database(path)
      : new mod.Database(path, { create: true });
  return attachPragma(db);
}

/**
 * Open SQLite. Node / the extension host use better-sqlite3 (ADR-0003).
 * Bun cannot dlopen that addon, so Bun-hosted hosts (playground Vite, MCP)
 * use `bun:sqlite` first — same file, same schema.
 */
export function openSqliteDatabase(path = ":memory:"): SqliteDatabase {
  if (isBunRuntime()) {
    try {
      return openBunSqlite(path);
    } catch {
      /* native better-sqlite3 in a Node worker */
    }
  }
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

/**
 * Move a corrupt database (and its WAL/SHM side files) aside as
 * `*.corrupt-<ts>` so it is never read again but can still be inspected
 * (plan §2.4), and log `index.corrupt`. A file that is not there is skipped.
 */
export async function quarantineDbFiles(
  dbPath: string,
  reason: string,
  now: number = Date.now(),
): Promise<readonly string[]> {
  const moved: string[] = [];
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (!existsSync(path)) continue;
    const target = `${path}.corrupt-${now}`;
    await rename(path, target);
    moved.push(target);
  }
  recordEvent({
    event: "index.corrupt",
    outcome: "degraded",
    reason,
    detail: { path: dbPath, moved: moved.length },
  });
  return moved;
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
          driver: isSqliteDriverError(cause),
        }),
      );
    }
  };

  let opened = tryOpen(false);
  if (!opened.ok) {
    const details = opened.error.details as
      | { cause?: unknown; driver?: boolean }
      | undefined;
    if (details?.driver === true || isSqliteDriverError(details?.cause)) {
      return opened;
    }
    try {
      await quarantineDbFiles(dbPath, String(details?.cause ?? "open failed"));
    } catch (moveCause) {
      return err(
        ioError(`Failed to move aside corrupt SQLite cache: ${dbPath}`, {
          cause: String(moveCause),
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
