/**
 * Committed-text rationale → `rationale_for` edges (M-075 A1/A2).
 * Reads `.md` / source from disk. Never PDF, image, or video.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  unsafeEdgeId,
  unsafeNodeId,
  type GraphEdgeDto,
  type GraphNodeDto,
  type IndexSnapshot,
} from "@repo-prism/shared";

const TEXT_EXT = /\.(md|mdx|ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;
const BINARY_EXT = /\.(pdf|png|jpe?g|gif|webp|svg|mp4|mov|webm)$/i;
const ADR_FILE =
  /(?:^|\/)(?:plans\/adr\/|docs\/adr\/|adr\/)|(?:^|\/)ADR-\d{4}/i;
const ADR_ID = /ADR-(\d{4})/gi;
const PATH_TOKEN = /(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z]{1,8}/g;
const WHY_NOTE = /(?:\/\/|\/\*|#|--|<!--)\s*(WHY|NOTE):\s*([^\n*]{1,300})/gi;
const MAX_BYTES = 256_000;

export type RationaleHit = {
  readonly fromId: string;
  readonly toPath: string;
  readonly text: string;
  readonly adrPath: string;
};

function fileNodeId(path: string): string {
  return unsafeNodeId(`file:${path}`);
}

function adrNodeId(adrPath: string): string {
  return unsafeNodeId(`adr:${adrPath}`);
}

function isTextPath(path: string): boolean {
  if (BINARY_EXT.test(path)) return false;
  return TEXT_EXT.test(path);
}

function readCommitted(root: string, rel: string): string | null {
  if (!isTextPath(rel)) return null;
  try {
    const buf = readFileSync(join(root, rel), { encoding: "utf8" });
    if (buf.length > MAX_BYTES) return buf.slice(0, MAX_BYTES);
    return buf;
  } catch {
    return null;
  }
}

function mentionedPaths(
  tokens: readonly string[],
  indexed: ReadonlySet<string>,
): string[] {
  const hits = new Set<string>();
  for (const norm of tokens) if (indexed.has(norm)) hits.add(norm);
  return [...hits].sort((a, b) => a.localeCompare(b));
}

/** What one file contributes: path mentions (ADR files) and WHY/NOTE lines. */
type FileScan = {
  readonly adr: boolean;
  readonly pathTokens: readonly string[];
  readonly notes: readonly string[];
};

/**
 * Per-file scans keyed by root and path, kept while the content hash holds.
 * A reindex makes a new snapshot; without this every file was read again
 * (most of a cold Prepare after a checkout, token fix 2).
 */
const scanCache = new Map<string, { hash: string; scan: FileScan | null }>();
const SCAN_CACHE_MAX = 200_000;

function scanFile(
  root: string,
  path: string,
  hash: string | null,
): FileScan | null {
  const key = `${root}\0${path}`;
  const hit = hash ? scanCache.get(key) : undefined;
  if (hit && hit.hash === hash) return hit.scan;
  const body = readCommitted(root, path);
  let scan: FileScan | null = null;
  if (body) {
    const adr = ADR_FILE.test(path);
    const pathTokens = adr
      ? (body.match(PATH_TOKEN) ?? []).map((raw) =>
          raw.replace(/\\/g, "/").replace(/^\.\//, ""),
        )
      : [];
    const notes: string[] = [];
    WHY_NOTE.lastIndex = 0;
    let match: RegExpExecArray | null = WHY_NOTE.exec(body);
    while (match) {
      notes.push(`${match[1]}: ${match[2]!.trim()}`);
      match = WHY_NOTE.exec(body);
    }
    scan = { adr, pathTokens, notes };
  }
  if (hash) {
    if (scanCache.size >= SCAN_CACHE_MAX) scanCache.clear();
    scanCache.set(key, { hash, scan });
  }
  return scan;
}

export function collectRationale(snapshot: IndexSnapshot): {
  readonly nodes: readonly GraphNodeDto[];
  readonly edges: readonly GraphEdgeDto[];
  readonly hits: readonly RationaleHit[];
} {
  const indexed = new Set(snapshot.files.map((f) => f.path));
  const nodes = new Map<string, GraphNodeDto>();
  const edges = new Map<string, GraphEdgeDto>();
  const hits: RationaleHit[] = [];

  const addEdge = (
    from: string,
    toPath: string,
    text: string,
    adrPath: string,
  ) => {
    const to = fileNodeId(toPath);
    const id = unsafeEdgeId(`rationale_for:${from}->${to}`);
    if (edges.has(id)) return;
    edges.set(id, {
      id,
      kind: "rationale_for",
      from,
      to,
      attrs: { text, path: adrPath },
      provenance: "measured",
    });
    hits.push({ fromId: from, toPath, text, adrPath });
  };

  for (const file of snapshot.files) {
    const scan = scanFile(snapshot.rootPath, file.path, file.contentHash);
    if (!scan) continue;

    if (scan.adr) {
      const id = adrNodeId(file.path);
      if (!nodes.has(id)) {
        const label =
          [...file.path.matchAll(ADR_ID)][0]?.[0] ??
          file.path.split("/").at(-1) ??
          file.path;
        nodes.set(id, {
          id,
          kind: "adr",
          label,
          attrs: { path: file.path },
        });
      }
      for (const toPath of mentionedPaths(scan.pathTokens, indexed)) {
        if (toPath === file.path) continue;
        addEdge(id, toPath, `ADR names ${toPath}`, file.path);
      }
    }

    for (const text of scan.notes) {
      const id = adrNodeId(file.path);
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          kind: "adr",
          label: file.path.split("/").at(-1) ?? file.path,
          attrs: { path: file.path, comment: true },
        });
      }
      addEdge(id, file.path, text, file.path);
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    hits,
  };
}
