import {
  PrismErrorCode,
  err,
  ok,
  prismError,
  type BlastRadiusItem,
  type GraphSnapshotDto,
  type PrismError,
  type Result,
} from "@prism/shared";

/** Coarse classification of how an affected file is impacted (M-046 tweak). */
export type BlastImpactCategory = NonNullable<BlastRadiusItem["category"]>;

export const FILE_PREFIX = "file:";
export const DEFAULT_BLAST_MAX_DEPTH = 6;
/** References/imports at or above this count flag a `widely-used` change. */
export const WIDELY_USED_THRESHOLD = 3;
/** Extra risk points for foundational config/build files (clamped with a High floor). */
export const CONFIG_FILE_RISK_BOOST = 25;
/** Minimum risk for repo-critical config paths (High band starts at 60). */
export const CONFIG_FILE_RISK_FLOOR = 60;

/**
 * Repo-critical config / build / CI paths that matter even without import edges
 * (`package.json`, bundler/tsconfig, Cargo/go/pyproject, Dockerfile, workflows).
 */
export function isRepoCriticalPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? normalized;
  if (base === "package.json") return true;
  if (base === "Cargo.toml" || base === "go.mod" || base === "pyproject.toml") {
    return true;
  }
  if (base === "Dockerfile" || /^Dockerfile\./i.test(base)) return true;
  if (/^vite\.config\./i.test(base)) return true;
  if (/^webpack\.config\./i.test(base)) return true;
  if (/^next\.config\./i.test(base)) return true;
  if (/^tsconfig.*\.json$/i.test(base)) return true;
  if (
    normalized === ".github/workflows" ||
    normalized.startsWith(".github/workflows/") ||
    normalized.includes("/.github/workflows/")
  ) {
    return true;
  }
  return false;
}

/** Change target: a file path or a symbol (resolved via the knowledge graph). */
export type BlastRadiusOrigin = {
  readonly kind: "file" | "symbol";
  readonly id: string;
  readonly path?: string;
};

/** Minimal symbol shape (structurally compatible with intelligence `SymbolHit`). */
export type ImpactSymbol = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly kind?: string;
  readonly exported?: boolean;
};

/** Minimal reference shape (compatible with intelligence `ReferenceHit`). */
export type ImpactReference = {
  readonly name: string;
  readonly path: string;
  readonly targetSymbolId: string | null;
  readonly kind?: string;
};

export type ImpactContext = {
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

export function stripFilePrefix(idOrPath: string): string {
  return idOrPath.startsWith(FILE_PREFIX)
    ? idOrPath.slice(FILE_PREFIX.length)
    : idOrPath;
}

export function isTestPath(path: string): boolean {
  return /(^|\/)__tests__\//.test(path) || /\.(test|spec)\.[a-z]+$/i.test(path);
}

/** A TypeScript declaration file (`*.d.ts`) — contributes types, not runtime. */
export function isTypeDeclarationPath(path: string): boolean {
  return /\.d\.ts$/i.test(path);
}

/** Whether a reverse-edge kind represents a re-export (`export`/`reexport`). */
export function isReexportEdge(edgeKind: string | undefined): boolean {
  return edgeKind !== undefined && /reexport|export/i.test(edgeKind);
}

/**
 * Coarse classification of how an affected file is impacted, from its path and
 * the reverse-edge kind that reached it. Priority: test → config → reexport →
 * type → import (the catch-all).
 */
export function classifyCategory(
  path: string,
  edgeKind: string | undefined,
): BlastImpactCategory {
  if (isTestPath(path)) return "test";
  if (isRepoCriticalPath(path)) return "config";
  if (isReexportEdge(edgeKind)) return "reexport";
  if (isTypeDeclarationPath(path)) return "type";
  return "import";
}

export type ReverseEdge = { readonly fromPath: string; readonly kind: string };

/** `importedPath -> [{ importerPath, edgeKind }]` (who depends on a file). */
export function buildReverseAdjacency(
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
    const entry: ReverseEdge = {
      fromPath: stripFilePrefix(edge.from),
      kind: edge.kind,
    };
    const list = reverse.get(toPath);
    if (list) list.push(entry);
    else reverse.set(toPath, [entry]);
  }
  return reverse;
}

export type ResolvedSymbol = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly kind?: string;
  readonly exported?: boolean;
};

export type ResolvedOrigin = {
  readonly originPath: string;
  readonly symbol: ResolvedSymbol | null;
};

export function resolveOrigin(
  origin: BlastRadiusOrigin,
  context: ImpactContext,
  analyzed: ReadonlySet<string>,
): Result<ResolvedOrigin, PrismError> {
  if (origin.kind === "file") {
    const originPath = origin.path ?? stripFilePrefix(origin.id);
    if (!analyzed.has(originPath)) {
      return err(
        prismError(
          PrismErrorCode.NOT_FOUND,
          `File not found in index: ${originPath}`,
        ),
      );
    }
    return ok({ originPath, symbol: null });
  }

  const symbols = context.symbols ?? [];
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
  return ok({
    originPath: match.path,
    symbol: {
      id: match.id,
      name: match.name,
      path: match.path,
      ...(match.kind === undefined ? {} : { kind: match.kind }),
      ...(match.exported === undefined ? {} : { exported: match.exported }),
    },
  });
}

export type Affected = {
  readonly depth: number;
  readonly reason: string;
  /** Reverse-edge kind that reached this file (undefined for symbol seeds). */
  readonly edgeKind?: string;
};

export type AffectedSet = {
  readonly originPath: string;
  readonly symbol: ResolvedSymbol | null;
  readonly affected: Map<string, Affected>;
  readonly truncated: boolean;
};

/** References that resolve to (or name-match) the target symbol. */
export function referencesToSymbol(
  context: ImpactContext,
  symbol: ResolvedSymbol,
): ImpactReference[] {
  return (context.references ?? []).filter(
    (ref) => ref.targetSymbolId === symbol.id || ref.name === symbol.name,
  );
}

/**
 * Reverse-reachability affected set — the shared primitive behind blast
 * radius, safe delete, rename impact, and test impact. Every file that
 * (transitively) imports the origin is "affected"; symbol targets seed from the
 * files that reference the symbol.
 */
export function computeAffected(
  origin: BlastRadiusOrigin,
  context: ImpactContext,
): Result<AffectedSet, PrismError> {
  const maxDepth = context.maxDepth ?? DEFAULT_BLAST_MAX_DEPTH;
  const analyzed = new Set(context.analyzedPaths);
  const reverse = buildReverseAdjacency(context.dependencyGraph);

  const resolved = resolveOrigin(origin, context, analyzed);
  if (!resolved.ok) return resolved;
  const { originPath, symbol } = resolved.value;

  const affected = new Map<string, Affected>();
  const seen = new Set<string>([originPath]);
  const queue: Array<{ path: string; depth: number }> = [];
  let truncated = false;

  const enqueue = (
    path: string,
    depth: number,
    reason: string,
    edgeKind?: string,
  ) => {
    if (seen.has(path)) return;
    seen.add(path);
    affected.set(path, {
      depth,
      reason,
      ...(edgeKind === undefined ? {} : { edgeKind }),
    });
    queue.push({ path, depth });
  };

  if (origin.kind === "symbol" && symbol) {
    const refPaths = new Set<string>();
    for (const ref of referencesToSymbol(context, symbol)) {
      if (ref.path !== originPath) refPaths.add(ref.path);
    }
    for (const path of [...refPaths].sort()) {
      enqueue(path, 1, `references ${symbol.name}`);
    }
  } else {
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
        neighbor.kind,
      );
    }
  }

  return ok({ originPath, symbol, affected, truncated });
}

/** Sorted affected files as report items (depth asc, then path), classified. */
export function affectedItems(affected: Map<string, Affected>): Array<{
  path: string;
  reason: string;
  depth: number;
  category: BlastImpactCategory;
}> {
  return [...affected.entries()]
    .map(([path, info]) => ({
      path,
      reason: info.reason,
      depth: info.depth,
      category: classifyCategory(path, info.edgeKind),
    }))
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}
