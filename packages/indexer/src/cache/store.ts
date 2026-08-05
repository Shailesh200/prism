import type Database from "better-sqlite3";
import {
  IndexedFileSchema,
  IndexSnapshotSchema,
  type IndexedFile,
  type IndexSnapshot,
} from "@prism/shared";

type FileRow = {
  path: string;
  content_hash: string | null;
  plugin_id: string | null;
  status: string;
  payload_json: string;
};

type MetaRow = {
  root_path: string;
  repo_id: string;
  indexed_at: string;
  stats_json: string;
  warnings_json: string;
  source: string;
};

export function loadCachedFiles(
  db: Database.Database,
  rootPath: string,
): Map<string, IndexedFile> {
  const rows = db
    .prepare(
      `SELECT path, content_hash, plugin_id, status, payload_json
       FROM indexed_files WHERE root_path = ?`,
    )
    .all(rootPath) as FileRow[];

  const map = new Map<string, IndexedFile>();
  for (const row of rows) {
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      continue;
    }
    const parsed = IndexedFileSchema.safeParse({
      path: row.path,
      pluginId: row.plugin_id,
      contentHash: row.content_hash,
      status: row.status,
      ...(typeof payload === "object" && payload !== null ? payload : {}),
    });
    if (parsed.success) {
      map.set(parsed.data.path, parsed.data);
    }
  }
  return map;
}

export function loadCachedSnapshot(
  db: Database.Database,
  rootPath: string,
): IndexSnapshot | null {
  const meta = db
    .prepare(
      `SELECT root_path, repo_id, indexed_at, stats_json, warnings_json, source
       FROM index_meta WHERE root_path = ?`,
    )
    .get(rootPath) as MetaRow | undefined;
  if (!meta) return null;

  const files = [...loadCachedFiles(db, rootPath).values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  let stats: unknown;
  let warnings: unknown;
  try {
    stats = JSON.parse(meta.stats_json);
    warnings = JSON.parse(meta.warnings_json);
  } catch {
    return null;
  }

  const parsed = IndexSnapshotSchema.safeParse({
    repoId: meta.repo_id,
    rootPath: meta.root_path,
    indexedAt: meta.indexed_at,
    files,
    stats,
    warnings,
  });
  return parsed.success ? parsed.data : null;
}

type IdentityRow = {
  path: string;
  content_hash: string | null;
  plugin_id: string | null;
  status: string;
};

/**
 * Writes the snapshot back, touching only the rows that actually differ.
 *
 * The obvious implementation — delete every row for the root, insert the
 * snapshot — costs the same whether one file changed or all of them did, and
 * that cost is not small: re-serialising 10k payloads measured about a second,
 * which was the largest single item in an incremental reindex (M-035).
 *
 * A row is left alone when its identity columns are unchanged. That is sound
 * for the same reason the reuse path is sound: a file's payload is derived from
 * its content, so equal hashes (plus the same plugin and status, in case a file
 * changed category without changing bytes) mean the stored payload is the one
 * we were about to write. `canReuseCachedFile` already relies on this, and a
 * schema version bump invalidates the whole cache when the derivation changes.
 */
export function saveSnapshot(
  db: Database.Database,
  snapshot: IndexSnapshot,
): void {
  const tx = db.transaction(() => {
    const existing = new Map<string, IdentityRow>();
    const rows = db
      .prepare(
        `SELECT path, content_hash, plugin_id, status
         FROM indexed_files WHERE root_path = ?`,
      )
      .all(snapshot.rootPath) as IdentityRow[];
    for (const row of rows) existing.set(row.path, row);

    db.prepare(
      `INSERT INTO index_meta
        (root_path, repo_id, indexed_at, stats_json, warnings_json, source)
       VALUES (?, ?, ?, ?, ?, 'local')
       ON CONFLICT(root_path) DO UPDATE SET
         repo_id = excluded.repo_id,
         indexed_at = excluded.indexed_at,
         stats_json = excluded.stats_json,
         warnings_json = excluded.warnings_json,
         source = excluded.source`,
    ).run(
      snapshot.rootPath,
      snapshot.repoId,
      snapshot.indexedAt,
      JSON.stringify(snapshot.stats),
      JSON.stringify(snapshot.warnings),
    );

    const upsert = db.prepare(
      `INSERT INTO indexed_files
        (root_path, path, content_hash, plugin_id, status, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(root_path, path) DO UPDATE SET
         content_hash = excluded.content_hash,
         plugin_id = excluded.plugin_id,
         status = excluded.status,
         payload_json = excluded.payload_json`,
    );

    const live = new Set<string>();
    for (const file of snapshot.files) {
      live.add(file.path);

      const prior = existing.get(file.path);
      if (
        prior &&
        prior.content_hash === file.contentHash &&
        prior.plugin_id === file.pluginId &&
        prior.status === file.status
      ) {
        continue;
      }

      const payload = {
        symbols: file.symbols,
        imports: file.imports,
        exports: file.exports,
        references: file.references,
        diagnostics: file.diagnostics,
        ...(file.error === undefined ? {} : { error: file.error }),
      };
      upsert.run(
        snapshot.rootPath,
        file.path,
        file.contentHash,
        file.pluginId,
        file.status,
        JSON.stringify(payload),
      );
    }

    const remove = db.prepare(
      `DELETE FROM indexed_files WHERE root_path = ? AND path = ?`,
    );
    for (const path of existing.keys()) {
      if (!live.has(path)) remove.run(snapshot.rootPath, path);
    }
  });
  tx();
}

/**
 * A cached file is reusable when path exists in cache and content hashes match
 * (both null counts as match for skip-only rows without hashes).
 */
export function canReuseCachedFile(
  entryHash: string | null,
  cached: IndexedFile | undefined,
): cached is IndexedFile {
  if (!cached) return false;
  return cached.contentHash === entryHash;
}
