import type Database from "better-sqlite3";
import {
  HealthHistoryPointSchema,
  RegionHealthPointSchema,
  type HealthHistoryPoint,
  type RegionHealthPoint,
} from "@prism/shared";

/** Persisted payload for one history row (health + regions). */
export type HealthHistoryPayload = {
  readonly health: HealthHistoryPoint;
  readonly regions: RegionHealthPoint;
};

type HistoryRow = {
  at: string;
  commit_sha: string | null;
  payload_json: string;
};

function parsePayload(raw: string): HealthHistoryPayload | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const health = HealthHistoryPointSchema.safeParse(obj.health);
  const regions = RegionHealthPointSchema.safeParse(obj.regions);
  if (!health.success || !regions.success) return null;
  return { health: health.data, regions: regions.data };
}

/** True when a snapshot for this commit SHA already exists. */
export function hasHealthHistorySha(
  db: Database.Database,
  repoRoot: string,
  commitSha: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM health_history
       WHERE repo_root = ? AND commit_sha = ? LIMIT 1`,
    )
    .get(repoRoot, commitSha) as { ok: number } | undefined;
  return row !== undefined;
}

/**
 * Append a health + region snapshot. Rows with the same commit_sha are skipped
 * (unique index). Forward snapshots without a sha always insert.
 */
export function appendHealthHistory(
  db: Database.Database,
  repoRoot: string,
  payload: HealthHistoryPayload,
): boolean {
  const sha = payload.health.commitSha ?? payload.regions.commitSha ?? null;
  if (sha && hasHealthHistorySha(db, repoRoot, sha)) {
    return false;
  }
  db.prepare(
    `INSERT INTO health_history (repo_root, at, commit_sha, payload_json)
     VALUES (?, ?, ?, ?)`,
  ).run(
    repoRoot,
    payload.health.at,
    sha,
    JSON.stringify({
      health: payload.health,
      regions: payload.regions,
    }),
  );
  return true;
}

export type ListHealthHistoryOptions = {
  readonly since?: string;
  readonly limit?: number;
};

/** Load history payloads newest-first (then reverse for chronological reports). */
export function listHealthHistory(
  db: Database.Database,
  repoRoot: string,
  options: ListHealthHistoryOptions = {},
): HealthHistoryPayload[] {
  const limit =
    options.limit !== undefined && options.limit > 0
      ? Math.min(options.limit, 500)
      : 200;
  const since = options.since;
  const rows = (
    since
      ? (db
          .prepare(
            `SELECT at, commit_sha, payload_json FROM health_history
             WHERE repo_root = ? AND at >= ?
             ORDER BY at DESC LIMIT ?`,
          )
          .all(repoRoot, since, limit) as HistoryRow[])
      : (db
          .prepare(
            `SELECT at, commit_sha, payload_json FROM health_history
             WHERE repo_root = ?
             ORDER BY at DESC LIMIT ?`,
          )
          .all(repoRoot, limit) as HistoryRow[])
  ).reverse();

  const out: HealthHistoryPayload[] = [];
  for (const row of rows) {
    const parsed = parsePayload(row.payload_json);
    if (parsed) out.push(parsed);
  }
  return out;
}
