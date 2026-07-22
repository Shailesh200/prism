import {
  PrismErrorCode,
  err,
  ok,
  prismError,
  type BlastRadiusReport,
  type GraphSnapshotDto,
  type PrismError,
  type Result,
} from "@prism/shared";

/** Change target: a file path or a symbol (resolved via the knowledge graph). */
export type BlastRadiusOrigin = {
  readonly kind: "file" | "symbol";
  /** File node id / path (`file:foo.ts` or `foo.ts`) or a symbol id / name. */
  readonly id: string;
  /** Optional disambiguating repo-relative path (mainly for symbols). */
  readonly path?: string;
};

/** Minimal symbol shape (structurally compatible with intelligence `SymbolHit`). */
export type ImpactSymbol = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
};

/** Minimal reference shape (compatible with intelligence `ReferenceHit`). */
export type ImpactReference = {
  readonly name: string;
  readonly path: string;
  readonly targetSymbolId: string | null;
};

export type BlastRadiusOptions = {
  /** File-level dependency graph (nodes/edges from `buildDependencyGraph`). */
  readonly dependencyGraph: GraphSnapshotDto;
  /** All analyzed repo-relative file paths (for totals + test detection). */
  readonly analyzedPaths: readonly string[];
  /** Max reverse-dependency depth to traverse (default 6). */
  readonly maxDepth?: number;
  /** Knowledge-graph symbols (required for `kind: "symbol"`). */
  readonly symbols?: readonly ImpactSymbol[];
  /** Knowledge-graph references (required for `kind: "symbol"`). */
  readonly references?: readonly ImpactReference[];
};

export const DEFAULT_BLAST_MAX_DEPTH = 6;

const FILE_PREFIX = "file:";

function stripFilePrefix(idOrPath: string): string {
  return idOrPath.startsWith(FILE_PREFIX)
    ? idOrPath.slice(FILE_PREFIX.length)
    : idOrPath;
}

function isTestPath(path: string): boolean {
  return /(^|\/)__tests__\//.test(path) || /\.(test|spec)\.[a-z]+$/i.test(path);
}

type ReverseEdge = { readonly fromPath: string; readonly kind: string };

function buildReverseAdjacency(
  graph: GraphSnapshotDto,
): Map<string, ReverseEdge[]> {
  const reverse = new Map<string, ReverseEdge[]>();
  for (const edge of graph.edges) {
    if (
      !edge.from.startsWith(FILE_PREFIX) ||
      !edge.to.startsWith(FILE_PREFIX)
    ) {
      continue;
    }
    const toPath = stripFilePrefix(edge.to);
    const fromPath = stripFilePrefix(edge.from);
    const list = reverse.get(toPath);
    const entry: ReverseEdge = { fromPath, kind: edge.kind };
    if (list) list.push(entry);
    else reverse.set(toPath, [entry]);
  }
  return reverse;
}

type Affected = { depth: number; reason: string };

/**
 * Compute the blast radius (reverse-dependency impact) of a change target.
 *
 * Traverses the file dependency graph backwards from the origin — every file
 * that (transitively) imports the origin is "affected". For symbol targets the
 * seeds are the files that reference the symbol; their dependents then cascade.
 *
 * Risk score (0–100, deterministic) =
 *   `55 * reachRatio` (share of the repo impacted)
 *   `+ min(30, directDependents * 5)` (immediate fan-in)
 *   `+ 15` when no affected file looks like a test (untested-change penalty),
 * clamped to [0, 100]. See `plans/milestones/M-020_blast-radius.md`.
 */
export function computeBlastRadius(
  origin: BlastRadiusOrigin,
  options: BlastRadiusOptions,
): Result<BlastRadiusReport, PrismError> {
  const maxDepth = options.maxDepth ?? DEFAULT_BLAST_MAX_DEPTH;
  const analyzed = new Set(options.analyzedPaths);
  const reverse = buildReverseAdjacency(options.dependencyGraph);

  // Resolve origin file + (for symbols) the seed frontier.
  let originPath: string;
  let symbolName: string | undefined;
  let symbolId: string | undefined;

  if (origin.kind === "file") {
    originPath = origin.path ?? stripFilePrefix(origin.id);
    if (!analyzed.has(originPath)) {
      return err(
        prismError(
          PrismErrorCode.NOT_FOUND,
          `File not found in index: ${originPath}`,
        ),
      );
    }
  } else {
    const symbols = options.symbols ?? [];
    const match =
      symbols.find((s) => s.id === origin.id) ??
      symbols.find(
        (s) =>
          s.name === origin.id &&
          (origin.path === undefined || s.path === origin.path),
      );
    if (!match) {
      return err(
        prismError(PrismErrorCode.NOT_FOUND, `Symbol not found: ${origin.id}`),
      );
    }
    originPath = match.path;
    symbolName = match.name;
    symbolId = match.id;
  }

  const affected = new Map<string, Affected>();
  const seen = new Set<string>([originPath]);
  const queue: Array<{ path: string; depth: number }> = [];
  let truncated = false;

  const enqueue = (path: string, depth: number, reason: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    affected.set(path, { depth, reason });
    queue.push({ path, depth });
  };

  if (origin.kind === "symbol") {
    // Seed = files that reference the symbol (depth 1); dependents cascade.
    const refPaths = new Set<string>();
    for (const ref of options.references ?? []) {
      const matches =
        (symbolId !== undefined && ref.targetSymbolId === symbolId) ||
        ref.name === symbolName;
      if (matches && ref.path !== originPath) refPaths.add(ref.path);
    }
    for (const path of [...refPaths].sort()) {
      enqueue(path, 1, `references ${symbolName ?? origin.id}`);
    }
  } else {
    // File change: start from the origin, importers cascade.
    queue.push({ path: originPath, depth: 0 });
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const neighbors = reverse.get(current.path) ?? [];
    if (current.depth >= maxDepth) {
      if (neighbors.some((n) => !seen.has(n.fromPath))) truncated = true;
      continue;
    }
    for (const neighbor of neighbors) {
      enqueue(
        neighbor.fromPath,
        current.depth + 1,
        `${neighbor.kind}s ${current.path}`,
      );
    }
  }

  const affectedFiles = [...affected.entries()]
    .map(([path, info]) => ({ path, reason: info.reason, depth: info.depth }))
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));

  const testsLikelyAffected = affectedFiles
    .map((f) => f.path)
    .filter((p) => isTestPath(p))
    .sort((a, b) => a.localeCompare(b));

  const total = analyzed.size;
  const reachRatio = total > 1 ? affectedFiles.length / (total - 1) : 0;
  const directDependents = affectedFiles.filter((f) => f.depth === 1).length;
  const risk = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        55 * reachRatio +
          Math.min(30, directDependents * 5) +
          (testsLikelyAffected.length > 0 ? 0 : 15),
      ),
    ),
  );

  const report: BlastRadiusReport = {
    origin: {
      kind: origin.kind,
      id: origin.id,
      path: originPath,
    },
    risk,
    affectedFiles,
    testsLikelyAffected,
    ...(truncated ? { truncated: true } : {}),
  };
  return ok(report);
}
