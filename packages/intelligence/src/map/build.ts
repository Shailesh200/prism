/**
 * Compact repo map entries (P1): PageRank over imports + optional git recency.
 */

import type { IndexSnapshot, IndexedFile } from "@repo-prism/shared";
import { isTestPath } from "@repo-prism/shared";
import {
  fileSourceReader,
  signaturesForFile,
  type SourceReader,
} from "../prepare/signatures.js";

export type MapSignature = {
  readonly name: string;
  readonly kind: string;
  readonly signature: string;
  readonly line: number;
};

export type MapFileEntry = {
  readonly path: string;
  readonly rank: number;
  readonly signatures: readonly MapSignature[];
  readonly callers: readonly string[];
  readonly callees: readonly string[];
  readonly contentHash: string | null;
};

export type BuildRepoMapInput = {
  readonly snapshot: IndexSnapshot;
  /** File→file import edges (workspace-relative paths, no `file:` prefix). */
  readonly imports: readonly { readonly from: string; readonly to: string }[];
  readonly scope?: string;
  readonly gitRecency?: ReadonlyMap<string, number>;
  readonly sources?: ReadonlyMap<string, string> | Record<string, string>;
  readonly readSource?: SourceReader;
};

const DAMPING = 0.85;
const ITERATIONS = 20;

function inScope(path: string, scope: string | undefined): boolean {
  if (!scope) return true;
  const s = scope.replace(/\/+$/, "");
  return path === s || path.startsWith(`${s}/`);
}

function pageRank(
  files: readonly string[],
  edges: readonly { from: string; to: string }[],
): Map<string, number> {
  const n = files.length;
  const scores = new Map<string, number>();
  if (n === 0) return scores;
  const set = new Set(files);
  const out = new Map<string, string[]>();
  for (const f of files) {
    scores.set(f, 1 / n);
    out.set(f, []);
  }
  for (const e of edges) {
    if (!set.has(e.from) || !set.has(e.to) || e.from === e.to) continue;
    out.get(e.from)!.push(e.to);
  }
  for (let i = 0; i < ITERATIONS; i += 1) {
    const next = new Map<string, number>();
    for (const f of files) next.set(f, (1 - DAMPING) / n);
    for (const f of files) {
      const targets = out.get(f)!;
      if (targets.length === 0) {
        // Dangling: distribute evenly
        const share = (DAMPING * (scores.get(f) ?? 0)) / n;
        for (const t of files) next.set(t, (next.get(t) ?? 0) + share);
        continue;
      }
      const share = (DAMPING * (scores.get(f) ?? 0)) / targets.length;
      for (const t of targets) next.set(t, (next.get(t) ?? 0) + share);
    }
    for (const f of files) scores.set(f, next.get(f) ?? 0);
  }
  return scores;
}

function neighbors(
  path: string,
  inbound: Map<string, string[]>,
  outbound: Map<string, string[]>,
): { callers: string[]; callees: string[] } {
  // A file imported twice from one place has two edges; list it once.
  const callers = [...new Set(inbound.get(path))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 3);
  const callees = [...new Set(outbound.get(path))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 3);
  return { callers, callees };
}

export function buildRepoMap(input: BuildRepoMapInput): MapFileEntry[] {
  const scope = input.scope;
  const files = input.snapshot.files.filter(
    (f) =>
      f.status === "analyzed" && !isTestPath(f.path) && inScope(f.path, scope),
  );
  const paths = files.map((f) => f.path);
  const pathSet = new Set(paths);
  const scopedEdges = input.imports.filter(
    (e) => pathSet.has(e.from) && pathSet.has(e.to),
  );
  const ranks = pageRank(paths, scopedEdges);
  const inbound = new Map<string, string[]>();
  const outbound = new Map<string, string[]>();
  for (const e of scopedEdges) {
    outbound.set(e.from, [...(outbound.get(e.from) ?? []), e.to]);
    inbound.set(e.to, [...(inbound.get(e.to) ?? []), e.from]);
  }
  const read =
    input.readSource ??
    fileSourceReader(input.snapshot.rootPath, input.sources);
  const byPath = new Map<string, IndexedFile>(files.map((f) => [f.path, f]));
  const entries: MapFileEntry[] = [];
  for (const path of paths) {
    const file = byPath.get(path)!;
    const source = read(path);
    const signatures = signaturesForFile(file, source).map((s) => ({
      name: s.name,
      kind: s.kind,
      signature: s.signature,
      line: s.line,
    }));
    const pr = ranks.get(path) ?? 0;
    const recency = input.gitRecency?.get(path) ?? 0;
    const rank = pr * (1 + 0.2 * Math.min(1, Math.max(0, recency)));
    const { callers, callees } = neighbors(path, inbound, outbound);
    entries.push({
      path,
      rank,
      signatures,
      callers,
      callees,
      contentHash: file.contentHash,
    });
  }
  return entries.sort(
    (a, b) => b.rank - a.rank || a.path.localeCompare(b.path),
  );
}

/** Re-render only paths whose contentHash changed (MAP-2). */
export function mergeMapEntries(
  previous: readonly MapFileEntry[],
  fresh: readonly MapFileEntry[],
  changedPaths: ReadonlySet<string>,
): MapFileEntry[] {
  const prev = new Map(previous.map((e) => [e.path, e]));
  const out: MapFileEntry[] = [];
  const seen = new Set<string>();
  for (const e of fresh) {
    seen.add(e.path);
    const old = prev.get(e.path);
    if (old && !changedPaths.has(e.path) && old.contentHash === e.contentHash) {
      // Keep prior signature/caller text but take new rank order later via fresh.rank
      out.push({
        ...old,
        rank: e.rank,
        callers: e.callers,
        callees: e.callees,
      });
    } else {
      out.push(e);
    }
  }
  for (const e of previous) {
    if (!seen.has(e.path)) continue;
  }
  return out.sort((a, b) => b.rank - a.rank || a.path.localeCompare(b.path));
}
