import {
  PrismErrorCode,
  classifyToolingRoot,
  err,
  isRepoCriticalPath,
  ok,
  prismError,
  type BlastImpactCategory,
  type BlastLaneSummary,
  type BlastRadiusItem,
  type GraphSnapshotDto,
  type ImpactConfidence,
  type ImpactLane,
  type PrismError,
  type Result,
  type ToolingCriticality,
} from "@prism/shared";

export type { BlastImpactCategory, ToolingCriticality };
export { classifyToolingRoot, isRepoCriticalPath };

export const FILE_PREFIX = "file:";
export const DEFAULT_BLAST_MAX_DEPTH = 6;
/** References/imports at or above this count flag a `widely-used` change. */
export const WIDELY_USED_THRESHOLD = 3;
/** Extra risk points for foundational config/build files (clamped with a High floor). */
export const CONFIG_FILE_RISK_BOOST = 25;
/** Minimum risk for critical tooling paths (High band starts at 60; floor 70). */
export const CONFIG_FILE_RISK_FLOOR = 70;
/** Soft reach weight so huge globs don't dominate (M-049). */
export const SOFT_REACH_ALPHA = 0.5;
/** Soft match contribution cap for scoring (pairs with soft index cap). */
export const SOFT_SCORE_CAP = 500;

/** Soft impact edge shape (structurally compatible with intelligence SoftImpactEdge). */
export type SoftImpactEdge = {
  readonly from: string;
  readonly to: string;
  readonly lane: ImpactLane;
  readonly reason: string;
  readonly confidence: ImpactConfidence;
  readonly evidence: readonly string[];
  readonly category?: BlastImpactCategory;
};

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
  /**
   * Inventory paths including skipped JSON configs — used for origin
   * resolution when the target is tooling-critical but not AST-analyzed.
   */
  readonly inventoryPaths?: readonly string[];
  /** Soft config/CI/script edges (M-049). */
  readonly softEdges?: readonly SoftImpactEdge[];
  readonly softTruncated?: boolean;
  readonly coverageNote?: string;
  /** Max reverse-dependency depth to traverse (default 6). */
  readonly maxDepth?: number;
  /** Edit vs delete scoring/copy emphasis (default edit). */
  readonly intent?: "edit" | "delete";
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

export function laneFromCategory(
  category: BlastImpactCategory | undefined,
): ImpactLane {
  switch (category) {
    case "reexport":
      return "reexport";
    case "test":
      return "test";
    case "config":
      return "config";
    case "type":
      return "type";
    default:
      return "import";
  }
}

export type ReverseEdge = {
  readonly fromPath: string;
  readonly kind: string;
  readonly typeOnly?: boolean;
  /** Import/re-export specifier that created the edge. */
  readonly source?: string;
  /** Named bindings when present on the edge. */
  readonly specifiers?: readonly string[];
};

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
    const typeOnly =
      edge.attrs &&
      (edge.attrs["typeOnly"] === true ||
        edge.attrs["importKind"] === "type" ||
        edge.attrs["type"] === true);
    const source =
      edge.attrs && typeof edge.attrs["source"] === "string"
        ? edge.attrs["source"]
        : undefined;
    const rawSpecs = edge.attrs?.["specifiers"];
    const specifiers = Array.isArray(rawSpecs)
      ? rawSpecs.filter((s): s is string => typeof s === "string")
      : undefined;
    const entry: ReverseEdge = {
      fromPath: stripFilePrefix(edge.from),
      kind: edge.kind,
      ...(typeOnly ? { typeOnly: true } : {}),
      ...(source ? { source } : {}),
      ...(specifiers && specifiers.length > 0 ? { specifiers } : {}),
    };
    const list = reverse.get(toPath);
    if (list) list.push(entry);
    else reverse.set(toPath, [entry]);
  }
  return reverse;
}

function evidenceForReverseEdge(neighbor: ReverseEdge): string[] | undefined {
  // Keep relative hard edges evidence-free for M-020 golden compatibility.
  if (!neighbor.source || neighbor.source.startsWith(".")) return undefined;
  if (neighbor.specifiers && neighbor.specifiers.length > 0) {
    return [
      `imported { ${neighbor.specifiers.join(", ")} } from '${neighbor.source}'`,
    ];
  }
  return [`import from '${neighbor.source}'`];
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
    const inventory = new Set(context.inventoryPaths ?? context.analyzedPaths);
    const inSoft =
      context.softEdges?.some(
        (e) => e.from === originPath || e.to === originPath,
      ) ?? false;
    if (!inventory.has(originPath) && !analyzed.has(originPath) && !inSoft) {
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
  readonly soft?: boolean;
  readonly lane?: ImpactLane;
  readonly confidence?: ImpactConfidence;
  readonly evidence?: readonly string[];
  readonly typeOnly?: boolean;
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
    extras?: Partial<Affected>,
  ) => {
    if (seen.has(path)) return;
    seen.add(path);
    affected.set(path, {
      depth,
      reason,
      ...(edgeKind === undefined ? {} : { edgeKind }),
      ...extras,
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
    // Export-usage seed: files that reference symbols exported from this file
    // (covers package/barrel consumers when KG resolved the import).
    seedExportUsages(originPath, context, enqueue);
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
      const typeOnly = neighbor.typeOnly === true;
      const evidence = evidenceForReverseEdge(neighbor);
      enqueue(
        neighbor.fromPath,
        current.depth + 1,
        `${neighbor.kind}s ${current.path}`,
        neighbor.kind,
        {
          ...(typeOnly
            ? {
                confidence: "high" as const,
                typeOnly: true,
                lane: "type" as const,
              }
            : isReexportEdge(neighbor.kind)
              ? { confidence: "high" as const, lane: "reexport" as const }
              : { confidence: "high" as const }),
          ...(evidence ? { evidence } : {}),
        },
      );
    }
  }

  return ok({ originPath, symbol, affected, truncated });
}

/**
 * Seed reverse reachability from KG references to exported symbols defined in
 * `originPath`. Safe no-op when symbols/references are absent.
 */
function seedExportUsages(
  originPath: string,
  context: ImpactContext,
  enqueue: (
    path: string,
    depth: number,
    reason: string,
    edgeKind?: string,
    extras?: Partial<Affected>,
  ) => void,
): void {
  const symbols = context.symbols ?? [];
  const references = context.references ?? [];
  if (symbols.length === 0 || references.length === 0) return;

  const exportedIds = new Set(
    symbols
      .filter((s) => s.path === originPath && s.exported !== false)
      .map((s) => s.id),
  );
  if (exportedIds.size === 0) return;

  const byId = new Map(
    symbols.filter((s) => exportedIds.has(s.id)).map((s) => [s.id, s]),
  );

  const hits = new Map<string, string[]>();
  for (const ref of references) {
    if (ref.path === originPath) continue;
    if (!ref.targetSymbolId || !exportedIds.has(ref.targetSymbolId)) continue;
    const sym = byId.get(ref.targetSymbolId);
    if (!sym) continue;
    const list = hits.get(ref.path) ?? [];
    if (!list.includes(sym.name)) list.push(sym.name);
    hits.set(ref.path, list);
  }

  for (const path of [...hits.keys()].sort()) {
    const names = (hits.get(path) ?? []).sort();
    enqueue(path, 1, `uses exports of ${originPath}`, "import", {
      confidence: "high",
      evidence: names.map((n) => `references export ${n} from ${originPath}`),
    });
  }
}

/**
 * Merge soft edges into an affected set (depth-1 soft hits). Hard paths win
 * on collision; soft-only paths are added with lane/confidence/evidence.
 */
export function mergeSoftAffected(
  originPath: string,
  hard: Map<string, Affected>,
  softEdges: readonly SoftImpactEdge[] | undefined,
): { softOnly: Map<string, Affected>; softDepth1: number } {
  const softOnly = new Map<string, Affected>();
  if (!softEdges || softEdges.length === 0) {
    return { softOnly, softDepth1: 0 };
  }

  let softDepth1 = 0;
  for (const edge of softEdges) {
    // Forward: origin is the config/manifest
    if (edge.from === originPath && edge.to !== originPath) {
      // Don't inflate softDepth1 / softOnly for paths already reached via hard edges.
      if (hard.has(edge.to) || softOnly.has(edge.to)) continue;
      softDepth1++;
      softOnly.set(edge.to, {
        depth: 1,
        reason: edge.reason,
        soft: true,
        lane: edge.lane,
        confidence: edge.confidence,
        evidence: edge.evidence,
        edgeKind: "soft",
      });
      continue;
    }
    // Reverse: origin is a matched consumer — config "covers" it
    if (edge.to === originPath && edge.from !== originPath) {
      if (hard.has(edge.from) || softOnly.has(edge.from)) continue;
      softDepth1++;
      softOnly.set(edge.from, {
        depth: 1,
        reason: `covers ${originPath} via soft signal`,
        soft: true,
        lane: edge.lane,
        confidence: edge.confidence,
        evidence: edge.evidence,
        edgeKind: "soft",
      });
    }
  }
  return { softOnly, softDepth1 };
}

/** Sorted affected files as report items (depth asc, then path), classified. */
export function affectedItems(
  affected: Map<string, Affected>,
): BlastRadiusItem[] {
  return [...affected.entries()]
    .map(([path, info]) => {
      const category: BlastImpactCategory = info.soft
        ? isTestPath(path) || info.lane === "test"
          ? "test"
          : info.lane === "import" || info.lane === "alias"
            ? info.lane === "alias"
              ? "runtime"
              : "import"
            : "config"
        : info.typeOnly
          ? "type"
          : classifyCategory(path, info.edgeKind);
      const lane =
        info.lane ??
        (info.soft
          ? isTestPath(path)
            ? "test"
            : "config"
          : laneFromCategory(category));
      const confidence = info.confidence ?? (info.soft ? "medium" : "high");
      const item: BlastRadiusItem = {
        path,
        reason: info.reason,
        depth: info.depth,
        category,
      };
      // Soft (and non-default hard) lanes expose multi-lane fields; hard
      // import/reexport defaults stay omitted for M-020 golden compatibility.
      if (info.soft || lane !== laneFromCategory(category)) {
        item.lane = lane;
      } else if (info.typeOnly) {
        item.lane = "type";
      }
      if (info.soft || confidence !== "high") {
        item.confidence = confidence;
      }
      if (info.evidence && info.evidence.length > 0) {
        item.evidence = [...info.evidence];
      }
      return item;
    })
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}

export function summarizeLanes(
  items: readonly BlastRadiusItem[],
): BlastLaneSummary[] {
  const order: ImpactLane[] = [
    "import",
    "reexport",
    "config",
    "package",
    "script",
    "workspace",
    "test",
    "ci",
    "env",
    "alias",
    "type",
  ];
  const labels: Record<ImpactLane, string> = {
    import: "Import dependents",
    reexport: "Re-exports / barrels",
    config: "Config & tooling",
    package: "Package / workspace",
    script: "Package scripts",
    workspace: "Workspace deps",
    test: "Tests to run",
    ci: "CI / Docker / tasks",
    env: "Env",
    alias: "Path aliases",
    type: "Type-only references",
  };
  const confRank: Record<ImpactConfidence, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  const buckets = new Map<
    ImpactLane,
    { count: number; max: ImpactConfidence | undefined }
  >();
  for (const item of items) {
    const lane = item.lane ?? laneFromCategory(item.category);
    const conf = item.confidence ?? "high";
    const cur = buckets.get(lane) ?? { count: 0, max: undefined };
    cur.count++;
    if (!cur.max || confRank[conf] > confRank[cur.max]) {
      cur.max = conf;
    }
    buckets.set(lane, cur);
  }
  return order
    .filter((id) => (buckets.get(id)?.count ?? 0) > 0)
    .map((id) => {
      const b = buckets.get(id)!;
      return {
        id,
        label: labels[id],
        count: b.count,
        ...(b.max ? { maxConfidence: b.max } : {}),
      };
    });
}

/**
 * M-049 risk scoring with soft contribution + tooling floors.
 */
export function scoreBlastRisk(args: {
  hardCount: number;
  softCount: number;
  hardDepth1: number;
  softDepth1: number;
  testsInRadius: number;
  analyzedFileCount: number;
  criticality: ToolingCriticality;
}): number {
  const S = Math.min(args.softCount, SOFT_SCORE_CAP);
  const denom = Math.max(1, args.analyzedFileCount - 1);
  const reach = (args.hardCount + SOFT_REACH_ALPHA * S) / denom;
  const fanIn = Math.min(30, args.hardDepth1 * 5 + args.softDepth1 * 3);
  const testTerm =
    args.testsInRadius > 0 ? 0 : args.criticality !== "none" ? 0 : 15;
  const base = 55 * reach + fanIn + testTerm;

  let risk: number;
  if (args.criticality === "critical") {
    risk = Math.max(base + CONFIG_FILE_RISK_BOOST, CONFIG_FILE_RISK_FLOOR);
  } else if (args.criticality === "elevated") {
    risk = Math.max(base + 15, 45);
  } else {
    risk = base;
  }
  return Math.round(Math.max(0, Math.min(100, risk)));
}
