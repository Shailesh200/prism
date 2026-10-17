/**
 * Persistent repo map cache under ~/.prism/workspaces/<id>/ (P1).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IndexSnapshot } from "@repo-prism/shared";
import type { MapFileEntry } from "./build.js";

export type MapCachePayload = {
  readonly snapshotKey: string;
  readonly entries: MapFileEntry[];
  readonly text: string;
  readonly scope?: string;
  readonly maxTokens: number;
};

/**
 * Content key: file paths and hashes, plus `extra` (other inputs to the map,
 * such as git history). Not the index time, so an unchanged repo reuses the map.
 */
export function snapshotKey(snapshot: IndexSnapshot, extra = ""): string {
  const h = createHash("sha256");
  h.update(extra);
  h.update("\0");
  h.update(String(snapshot.files.length));
  for (const f of snapshot.files) {
    h.update(f.path);
    h.update("\0");
    h.update(f.contentHash ?? "");
    h.update("\n");
  }
  return h.digest("hex").slice(0, 24);
}

export function mapCachePaths(workspaceDir: string): {
  readonly text: string;
  readonly meta: string;
} {
  return {
    text: join(workspaceDir, "map.v1.txt"),
    meta: join(workspaceDir, "map.v1.json"),
  };
}

export function readMapCache(
  workspaceDir: string,
): MapCachePayload | undefined {
  const paths = mapCachePaths(workspaceDir);
  if (!existsSync(paths.meta) || !existsSync(paths.text)) return undefined;
  try {
    const meta = JSON.parse(
      readFileSync(paths.meta, "utf8"),
    ) as MapCachePayload;
    const text = readFileSync(paths.text, "utf8");
    if (meta.snapshotKey && Array.isArray(meta.entries)) {
      return { ...meta, text };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function writeMapCache(
  workspaceDir: string,
  payload: MapCachePayload,
): void {
  mkdirSync(workspaceDir, { recursive: true });
  const paths = mapCachePaths(workspaceDir);
  writeFileSync(paths.text, payload.text, "utf8");
  writeFileSync(
    paths.meta,
    `${JSON.stringify({
      snapshotKey: payload.snapshotKey,
      entries: payload.entries,
      scope: payload.scope,
      maxTokens: payload.maxTokens,
    })}\n`,
    "utf8",
  );
}

export function changedPaths(
  previous: readonly MapFileEntry[],
  snapshot: IndexSnapshot,
): Set<string> {
  const prev = new Map(previous.map((e) => [e.path, e.contentHash]));
  const out = new Set<string>();
  for (const f of snapshot.files) {
    const old = prev.get(f.path);
    if (old === undefined || old !== f.contentHash) out.add(f.path);
  }
  for (const p of prev.keys()) {
    if (!snapshot.files.some((f) => f.path === p)) out.add(p);
  }
  return out;
}
