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

function mentionedPaths(text: string, indexed: ReadonlySet<string>): string[] {
  const hits = new Set<string>();
  for (const raw of text.match(PATH_TOKEN) ?? []) {
    const norm = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    if (indexed.has(norm)) hits.add(norm);
  }
  return [...hits].sort((a, b) => a.localeCompare(b));
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
    const body = readCommitted(snapshot.rootPath, file.path);
    if (!body) continue;

    if (ADR_FILE.test(file.path)) {
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
      for (const toPath of mentionedPaths(body, indexed)) {
        if (toPath === file.path) continue;
        addEdge(id, toPath, `ADR names ${toPath}`, file.path);
      }
    }

    WHY_NOTE.lastIndex = 0;
    let match: RegExpExecArray | null = WHY_NOTE.exec(body);
    while (match) {
      const text = `${match[1]}: ${match[2]!.trim()}`;
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
      match = WHY_NOTE.exec(body);
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    hits,
  };
}
