import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  PrismErrorCode,
  normalizeRepoPath,
  type FileInventory,
  type FileInventoryEntry,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@prism/shared";
import { DEFAULT_MAX_FILE_BYTES } from "./constants.js";
import { HASH_ALGO, hashBufferSha256, looksBinary } from "./hash.js";
import { createIgnoreEngine } from "./ignore-engine.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";

export type InventoryOptions = {
  readonly maxFileBytes?: number;
  readonly extraIgnorePatterns?: readonly string[];
};

/**
 * Classify / hash a single repo-relative path under a workspace root.
 * Returns null when the path is ignored or does not exist.
 */
export async function inventorySinglePath(
  workspaceRoot: string,
  repoPath: string,
  options: InventoryOptions = {},
): Promise<Result<FileInventoryEntry | null, PrismError>> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const engine = await createIgnoreEngine(
    workspaceRoot,
    options.extraIgnorePatterns
      ? { extraPatterns: options.extraIgnorePatterns }
      : {},
  );
  const normalized = normalizeRepoPath(repoPath.replace(/\\/g, "/"));
  if (!normalized.ok) return ok(null);
  const rel = normalized.value;
  if (engine.ignores(rel)) return ok(null);
  const abs = join(workspaceRoot, rel);
  try {
    const st = await stat(abs);
    if (!st.isFile()) return ok(null);
  } catch {
    return ok(null);
  }
  try {
    const entry = await classifyFile(
      { absolutePath: abs, repoPath: rel },
      maxFileBytes,
    );
    return ok(entry);
  } catch (cause) {
    return err(
      prismError(PrismErrorCode.IO_ERROR, `Failed to read file: ${rel}`, {
        path: rel,
        cause: String(cause),
      }),
    );
  }
}

type WalkItem = {
  readonly absolutePath: string;
  readonly repoPath: string;
};

async function collectFiles(
  workspaceRoot: string,
  ignores: (rel: string) => boolean,
): Promise<{ files: WalkItem[]; ignored: number }> {
  const files: WalkItem[] = [];
  let ignored = 0;

  const visit = async (dirAbs: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const abs = join(dirAbs, entry.name);
      const relOs = relative(workspaceRoot, abs);
      const rel = relOs.replace(/\\/g, "/");

      if (ignores(rel) || (entry.isDirectory() && ignores(`${rel}/`))) {
        ignored += 1;
        continue;
      }

      if (entry.isDirectory()) {
        await visit(abs);
        continue;
      }

      if (!entry.isFile()) continue;

      if (ignores(rel)) {
        ignored += 1;
        continue;
      }

      const normalized = normalizeRepoPath(rel);
      if (!normalized.ok) continue;
      files.push({ absolutePath: abs, repoPath: normalized.value });
    }
  };

  await visit(workspaceRoot);
  files.sort((a, b) =>
    a.repoPath < b.repoPath ? -1 : a.repoPath > b.repoPath ? 1 : 0,
  );
  return { files, ignored };
}

async function classifyFile(
  item: WalkItem,
  maxFileBytes: number,
): Promise<FileInventoryEntry> {
  const st = await stat(item.absolutePath);
  const sizeBytes = st.size;
  const mtimeMs = st.mtimeMs;

  if (sizeBytes > maxFileBytes) {
    return {
      path: item.repoPath,
      sizeBytes,
      mtimeMs,
      hashAlgo: HASH_ALGO,
      contentHash: null,
      status: "skipped_oversized",
    };
  }

  const buf = await readFile(item.absolutePath);
  if (looksBinary(buf)) {
    return {
      path: item.repoPath,
      sizeBytes,
      mtimeMs,
      hashAlgo: HASH_ALGO,
      contentHash: null,
      status: "skipped_binary",
    };
  }

  return {
    path: item.repoPath,
    sizeBytes,
    mtimeMs,
    hashAlgo: HASH_ALGO,
    contentHash: hashBufferSha256(buf),
    status: "hashed",
  };
}

/**
 * Walk a workspace, apply ignore rules, and produce a deterministic file inventory
 * with SHA-256 content hashes (in-memory only — no SQLite yet).
 */
export async function inventoryWorkspace(
  inputPath: string,
  options: InventoryOptions = {},
): Promise<Result<FileInventory, PrismError>> {
  const started = Date.now();
  const rootResult = await resolveWorkspaceRoot(inputPath);
  if (!rootResult.ok) return rootResult;

  const workspaceRoot = resolve(rootResult.value);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const engine = await createIgnoreEngine(
    workspaceRoot,
    options.extraIgnorePatterns
      ? { extraPatterns: options.extraIgnorePatterns }
      : {},
  );

  let collected;
  try {
    collected = await collectFiles(workspaceRoot, (rel) => engine.ignores(rel));
  } catch (cause) {
    return err(
      prismError(PrismErrorCode.IO_ERROR, "Failed to walk workspace", {
        root: workspaceRoot,
        cause: String(cause),
      }),
    );
  }

  const entries: FileInventoryEntry[] = [];
  for (const item of collected.files) {
    try {
      entries.push(await classifyFile(item, maxFileBytes));
    } catch (cause) {
      return err(
        prismError(
          PrismErrorCode.IO_ERROR,
          `Failed to read file: ${item.repoPath}`,
          { path: item.repoPath, cause: String(cause) },
        ),
      );
    }
  }

  const filesHashed = entries.filter((e) => e.status === "hashed").length;
  const filesSkipped = entries.length - filesHashed;

  return ok({
    rootPath: workspaceRoot,
    hashAlgo: HASH_ALGO,
    generatedAt: new Date().toISOString(),
    files: entries,
    stats: {
      filesSeen: entries.length,
      filesHashed,
      filesSkipped,
      filesIgnored: collected.ignored,
      durationMs: Date.now() - started,
    },
  });
}
