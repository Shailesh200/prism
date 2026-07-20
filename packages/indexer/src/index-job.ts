import { join } from "node:path";
import {
  createAnalyzerHost,
  createNoopPlugin,
  createTypescriptPlugin,
  type AnalyzerHost,
} from "@prism/analyzer";
import {
  PrismErrorCode,
  type FileInventoryEntry,
  type IndexCacheStats,
  type IndexProgressEvent,
  type IndexSnapshot,
  type IndexedFile,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
  unsafeRepoId,
} from "@prism/shared";
import { openIndexCache, type IndexCacheDb } from "./cache/db.js";
import {
  canReuseCachedFile,
  loadCachedFiles,
  saveSnapshot,
} from "./cache/store.js";
import { inventoryWorkspace } from "./inventory.js";

export const DEFAULT_INDEX_CONCURRENCY = 4;

export type IndexJobOptions = {
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: IndexProgressEvent) => void;
  readonly maxFileBytes?: number;
  readonly extraIgnorePatterns?: readonly string[];
  /** Inject analyzer host (tests). Default: TypeScript + noop plugins. */
  readonly analyzer?: AnalyzerHost;
  /** Persist / reuse SQLite cache (default true). */
  readonly cache?: boolean;
  /** Override SQLite path (tests). */
  readonly cacheDbPath?: string;
};

function emit(
  onProgress: IndexJobOptions["onProgress"],
  event: IndexProgressEvent,
): void {
  onProgress?.(event);
}

function cancelled(): PrismError {
  return prismError(PrismErrorCode.CANCELLED, "Index job was cancelled");
}

function assertNotCancelled(
  signal: AbortSignal | undefined,
): Result<true, PrismError> {
  if (signal?.aborted) return err(cancelled());
  return ok(true);
}

function skippedFromInventory(entry: FileInventoryEntry): IndexedFile | null {
  if (entry.status === "skipped_binary") {
    return {
      path: entry.path,
      pluginId: null,
      contentHash: entry.contentHash,
      status: "skipped_binary",
      symbols: [],
      imports: [],
      exports: [],
      references: [],
      diagnostics: [],
    };
  }
  if (entry.status === "skipped_oversized") {
    return {
      path: entry.path,
      pluginId: null,
      contentHash: entry.contentHash,
      status: "skipped_oversized",
      symbols: [],
      imports: [],
      exports: [],
      references: [],
      diagnostics: [],
    };
  }
  return null;
}

async function analyzeOne(
  rootPath: string,
  entry: FileInventoryEntry,
  analyzer: AnalyzerHost,
): Promise<IndexedFile> {
  const skipped = skippedFromInventory(entry);
  if (skipped) return skipped;

  const absolutePath = join(rootPath, entry.path);
  const plugin = analyzer.registry.resolveForPath(absolutePath);
  if (!plugin) {
    return {
      path: entry.path,
      pluginId: null,
      contentHash: entry.contentHash,
      status: "skipped_unsupported",
      symbols: [],
      imports: [],
      exports: [],
      references: [],
      diagnostics: [],
    };
  }

  const analyzed = await analyzer.analyzeFile(absolutePath);
  if (!analyzed.ok) {
    return {
      path: entry.path,
      pluginId: plugin.id,
      contentHash: entry.contentHash,
      status: "failed",
      symbols: [],
      imports: [],
      exports: [],
      references: [],
      diagnostics: [],
      error: {
        code: analyzed.error.code,
        message: analyzed.error.message,
      },
    };
  }

  const value = analyzed.value;
  return {
    path: entry.path,
    pluginId: value.pluginId,
    contentHash: entry.contentHash,
    status: "analyzed",
    symbols: value.symbols.map((s) => ({
      name: s.name,
      kind: s.kind,
      start: s.start,
      end: s.end,
      ...(s.exported === undefined ? {} : { exported: s.exported }),
    })),
    imports: value.imports.map((i) => ({
      source: i.source,
      specifiers: [...i.specifiers],
      ...(typeof i.start === "number" ? { start: i.start } : {}),
      ...(typeof i.end === "number" ? { end: i.end } : {}),
    })),
    exports: value.exports.map((e) => ({
      name: e.name,
      kind: e.kind,
      ...(typeof e.start === "number" ? { start: e.start } : {}),
      ...(typeof e.end === "number" ? { end: e.end } : {}),
      ...(e.source === undefined ? {} : { source: e.source }),
    })),
    references: value.references.map((r) => ({
      name: r.name,
      kind: r.kind,
      start: r.start,
      end: r.end,
    })),
    diagnostics: value.diagnostics.map((d) => ({
      severity: d.severity,
      message: d.message,
      ...(typeof d.start === "number" ? { start: d.start } : {}),
      ...(typeof d.end === "number" ? { end: d.end } : {}),
    })),
  };
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  signal: AbortSignal | undefined,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Result<R[], PrismError>> {
  const results: R[] = [];
  let next = 0;

  const runWorker = async (): Promise<Result<true, PrismError>> => {
    while (true) {
      const gate = assertNotCancelled(signal);
      if (!gate.ok) return gate;
      const index = next;
      next += 1;
      if (index >= items.length) return ok(true);
      results[index] = await worker(items[index]!, index);
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  const workers = Array.from({ length: workerCount }, () => runWorker());
  const settled = await Promise.all(workers);
  for (const result of settled) {
    if (!result.ok) return result;
  }
  return ok(results);
}

function cacheStatus(
  filesReused: number,
  filesAnalyzed: number,
  enabled: boolean,
): IndexCacheStats["status"] {
  if (!enabled) return "disabled";
  if (filesAnalyzed === 0 && filesReused > 0) return "hit";
  if (filesReused === 0) return "miss";
  return "partial";
}

/**
 * Full-repository index: inventory → cache match → analyze → snapshot → persist.
 * Per-file analyze failures are recorded; they do not fail the job.
 */
export async function runIndexJob(
  inputPath: string,
  options: IndexJobOptions = {},
): Promise<Result<IndexSnapshot, PrismError>> {
  const started = Date.now();
  const concurrency = options.concurrency ?? DEFAULT_INDEX_CONCURRENCY;
  const cacheEnabled = options.cache !== false;
  const analyzer =
    options.analyzer ??
    createAnalyzerHost({
      plugins: [createTypescriptPlugin(), createNoopPlugin()],
    });

  const gate0 = assertNotCancelled(options.signal);
  if (!gate0.ok) return gate0;

  emit(options.onProgress, {
    phase: "inventory",
    message: "Scanning workspace",
  });

  const inventory = await inventoryWorkspace(inputPath, {
    ...(typeof options.maxFileBytes === "number"
      ? { maxFileBytes: options.maxFileBytes }
      : {}),
    ...(options.extraIgnorePatterns
      ? { extraIgnorePatterns: options.extraIgnorePatterns }
      : {}),
  });
  if (!inventory.ok) return inventory;

  const rootPath = inventory.value.rootPath;
  const entries = inventory.value.files;
  const warnings: string[] = [];

  if (inventory.value.stats.filesIgnored > 0) {
    warnings.push(
      `ignored ${inventory.value.stats.filesIgnored} path(s) via ignore rules`,
    );
  }

  emit(options.onProgress, {
    phase: "inventory",
    filesTotal: entries.length,
    filesDone: entries.length,
    message: `Inventory complete (${entries.length} files)`,
  });

  const gate1 = assertNotCancelled(options.signal);
  if (!gate1.ok) return gate1;

  let cacheDb: IndexCacheDb | null = null;
  let cachedFiles = new Map<string, IndexedFile>();

  if (cacheEnabled) {
    emit(options.onProgress, {
      phase: "cache",
      message: "Opening local SQLite cache",
    });
    const opened = await openIndexCache(
      rootPath,
      options.cacheDbPath ? { dbPath: options.cacheDbPath } : {},
    );
    if (opened.ok) {
      cacheDb = opened.value;
      cachedFiles = loadCachedFiles(cacheDb.db, rootPath);
      emit(options.onProgress, {
        phase: "cache",
        filesTotal: entries.length,
        filesDone: cachedFiles.size,
        message: `Cache loaded (${cachedFiles.size} file row(s))`,
      });
    } else {
      warnings.push(`cache unavailable: ${opened.error.message}`);
    }
  }

  const reused: IndexedFile[] = [];
  const toAnalyze: FileInventoryEntry[] = [];

  for (const entry of entries) {
    const cached = cachedFiles.get(entry.path);
    if (canReuseCachedFile(entry.contentHash, cached)) {
      // Refresh hash/status from inventory for skip rows; keep analysis payload.
      reused.push({
        ...cached,
        contentHash: entry.contentHash,
        status:
          entry.status === "skipped_binary" ||
          entry.status === "skipped_oversized"
            ? entry.status
            : cached.status,
      });
    } else {
      toAnalyze.push(entry);
    }
  }

  emit(options.onProgress, {
    phase: "analyze",
    filesTotal: entries.length,
    filesDone: reused.length,
    message:
      toAnalyze.length === 0
        ? "Cache hit — skipping analyze"
        : `Analyzing ${toAnalyze.length} file(s)`,
  });

  let done = reused.length;
  const mapped = await mapPool(
    toAnalyze,
    concurrency,
    options.signal,
    async (entry) => {
      const file = await analyzeOne(rootPath, entry, analyzer);
      done += 1;
      emit(options.onProgress, {
        phase: "analyze",
        filesTotal: entries.length,
        filesDone: done,
        path: entry.path,
      });
      return file;
    },
  );
  if (!mapped.ok) {
    cacheDb?.close();
    return mapped;
  }

  const files = [...reused, ...mapped.value]
    .slice()
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const filesIndexed = files.filter((f) => f.status === "analyzed").length;
  const filesSkipped = files.filter((f) => f.status !== "analyzed").length;
  const failed = files.filter((f) => f.status === "failed").length;
  if (failed > 0) {
    warnings.push(`${failed} file(s) failed analysis (recorded in snapshot)`);
  }

  const cacheStats: IndexCacheStats = {
    status: cacheStatus(reused.length, mapped.value.length, cacheEnabled),
    filesReused: reused.length,
    filesAnalyzed: mapped.value.length,
  };
  if (cacheStats.status === "hit") {
    warnings.push(
      `cache-hit: reused ${cacheStats.filesReused}/${entries.length} file(s)`,
    );
  }

  const indexedAt = new Date().toISOString();
  const snapshot: IndexSnapshot = {
    repoId: unsafeRepoId(`repo:${rootPath}`),
    rootPath,
    indexedAt,
    files,
    stats: {
      filesTotal: files.length,
      filesIndexed,
      filesSkipped,
      durationMs: Date.now() - started,
    },
    warnings,
    cache: cacheStats,
  };

  if (cacheDb) {
    try {
      saveSnapshot(cacheDb.db, snapshot);
      emit(options.onProgress, {
        phase: "finalize",
        filesTotal: files.length,
        filesDone: files.length,
        message: "Index snapshot persisted to SQLite",
      });
    } catch (cause) {
      warnings.push(`cache write failed: ${String(cause)}`);
      emit(options.onProgress, {
        phase: "finalize",
        filesTotal: files.length,
        filesDone: files.length,
        message: "Index snapshot ready (cache write failed)",
      });
    } finally {
      cacheDb.close();
    }
  } else {
    emit(options.onProgress, {
      phase: "finalize",
      filesTotal: files.length,
      filesDone: files.length,
      message: "Index snapshot ready",
    });
  }

  return ok({
    ...snapshot,
    warnings,
  });
}

/** Derive the lightweight Core/MCP summary DTO from a full snapshot. */
export function snapshotToSummary(snapshot: IndexSnapshot) {
  return {
    repoId: snapshot.repoId,
    rootPath: snapshot.rootPath,
    indexedAt: snapshot.indexedAt,
    stats: snapshot.stats,
    warnings: [...snapshot.warnings],
  };
}
