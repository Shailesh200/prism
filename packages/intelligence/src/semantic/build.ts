import { nodesFromIndexSnapshot } from "@prism/graph-engine";
import {
  type GraphEdgeDto,
  type GraphNodeDto,
  type GraphSnapshotDto,
  type IndexedFile,
  type IndexedReference,
  type IndexSnapshot,
  type KnowledgeGraphStats,
  unsafeEdgeId,
  unsafeNodeId,
} from "@prism/shared";
import {
  isRelativeSpecifier,
  resolveImportTarget,
} from "../dependency/resolve.js";
import {
  discoverLocalPackages,
  resolveLocalPackageSpecifier,
  type LocalPackage,
} from "../dependency/packages.js";
import {
  loadTsconfigPathAliases,
  resolveAliasSpecifier,
  type PathAliasMap,
} from "../dependency/aliases.js";

function resolveModuleTarget(
  fromFile: string,
  source: string,
  indexedPaths: ReadonlySet<string>,
  packages: readonly LocalPackage[],
  aliases: PathAliasMap,
): string | null {
  if (isRelativeSpecifier(source)) {
    return resolveImportTarget(fromFile, source, indexedPaths);
  }
  const aliasHit = resolveAliasSpecifier(
    fromFile,
    source,
    indexedPaths,
    aliases,
  );
  if (aliasHit) return aliasHit;
  return resolveLocalPackageSpecifier(source, packages, indexedPaths);
}

export type { KnowledgeGraphStats };

export type SymbolHit = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly exported: boolean;
};

export type ReferenceHit = {
  readonly name: string;
  readonly kind: string;
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly targetSymbolId: string | null;
};

export type FindSymbolQuery = {
  readonly name: string;
  readonly path?: string;
  readonly kind?: string;
};

export type FindReferencesQuery = {
  /** Symbol name to find references of. */
  readonly name: string;
  /** Defining file (repo-relative); disambiguates same-named symbols. */
  readonly path?: string;
  /** Defining symbol start offset; further disambiguation. */
  readonly start?: number;
};

export type KnowledgeGraphResult = {
  readonly graph: GraphSnapshotDto;
  readonly stats: KnowledgeGraphStats;
  readonly symbols: SymbolHit[];
  readonly references: ReferenceHit[];
};

type SymbolRec = SymbolHit & { readonly nodeKind: string };

function fileNodeId(path: string): string {
  return unsafeNodeId(`file:${path}`);
}

function symbolNodeId(path: string, name: string, start: number): string {
  return unsafeNodeId(`symbol:${path}:${name}:${start}`);
}

function edgeId(kind: string, from: string, to: string): string {
  return unsafeEdgeId(`${kind}:${from}->${to}`);
}

function graphKindForSymbol(kind: string): string {
  if (kind === "type" || kind === "interface" || kind === "enum") return "type";
  return "symbol";
}

function isTestPath(path: string): boolean {
  return /\.(test|spec)\.(tsx?|jsx?|mts|cts)$/i.test(path);
}

function countBy(items: readonly { kind: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    out[item.kind] = (out[item.kind] ?? 0) + 1;
  }
  return out;
}

function enclosingSymbol(
  symbols: readonly SymbolRec[],
  offset: number,
): SymbolRec | null {
  let best: SymbolRec | null = null;
  for (const s of symbols) {
    if (offset < s.start || offset > s.end) continue;
    if (!best || s.end - s.start < best.end - best.start) best = s;
  }
  return best;
}

function buildSymbolIndex(files: readonly IndexedFile[]): {
  symbols: SymbolRec[];
  byPath: Map<string, SymbolRec[]>;
  byPathName: Map<string, SymbolRec[]>;
} {
  const symbols: SymbolRec[] = [];
  const byPath = new Map<string, SymbolRec[]>();
  const byPathName = new Map<string, SymbolRec[]>();

  for (const file of files) {
    if (file.status !== "analyzed") continue;
    const list: SymbolRec[] = [];
    for (const s of file.symbols) {
      const rec: SymbolRec = {
        id: symbolNodeId(file.path, s.name, s.start),
        name: s.name,
        kind: s.kind,
        path: file.path,
        start: s.start,
        end: s.end,
        exported: s.exported === true,
        nodeKind: graphKindForSymbol(s.kind),
      };
      symbols.push(rec);
      list.push(rec);
      const key = `${file.path}\0${s.name}`;
      const named = byPathName.get(key) ?? [];
      named.push(rec);
      byPathName.set(key, named);
    }
    byPath.set(file.path, list);
  }

  symbols.sort((a, b) => a.id.localeCompare(b.id));
  return { symbols, byPath, byPathName };
}

function resolveLocalExport(
  file: IndexedFile,
  name: string,
  byPathName: Map<string, SymbolRec[]>,
): SymbolRec | null {
  const candidates = byPathName.get(`${file.path}\0${name}`) ?? [];
  const exported = candidates.find((c) => c.exported);
  if (exported) return exported;
  if (candidates[0]) return candidates[0]!;
  // Export table may list a name without a matching symbol row
  if (file.exports.some((e) => e.name === name || e.name === "*")) {
    return candidates[0] ?? null;
  }
  return null;
}

function resolveReferenceTarget(
  file: IndexedFile,
  ref: IndexedReference,
  indexedPaths: ReadonlySet<string>,
  filesByPath: Map<string, IndexedFile>,
  byPath: Map<string, SymbolRec[]>,
  byPathName: Map<string, SymbolRec[]>,
  packages: readonly LocalPackage[],
  aliases: PathAliasMap,
): SymbolRec | null {
  const locals = byPath.get(file.path) ?? [];

  // Import binding wins for call/heritage when the name is imported
  for (const imp of file.imports) {
    if (!imp.specifiers.includes(ref.name)) continue;
    const targetPath = resolveModuleTarget(
      file.path,
      imp.source,
      indexedPaths,
      packages,
      aliases,
    );
    if (!targetPath) continue;
    const targetFile = filesByPath.get(targetPath);
    if (!targetFile) continue;
    const hit = resolveLocalExport(targetFile, ref.name, byPathName);
    if (hit) return hit;
  }

  // Local definition whose range does not contain the reference site
  const localDef = locals.find(
    (s) => s.name === ref.name && (ref.end <= s.start || ref.start >= s.end),
  );
  if (localDef) return localDef;

  // Same-file name (heritage inside class body still matches sibling types)
  return locals.find((s) => s.name === ref.name) ?? null;
}

function addEdge(
  edges: Map<string, GraphEdgeDto>,
  kind: string,
  from: string,
  to: string,
  attrs?: GraphEdgeDto["attrs"],
): void {
  const id = edgeId(kind, from, to);
  if (edges.has(id)) return;
  edges.set(id, {
    id,
    kind,
    from: unsafeNodeId(from),
    to: unsafeNodeId(to),
    ...(attrs === undefined ? {} : { attrs }),
  });
}

/**
 * Build a symbol-centric knowledge graph from an index snapshot.
 * Reference resolution is best-effort (name + relative imports).
 */
export function buildKnowledgeGraph(
  snapshot: IndexSnapshot,
): KnowledgeGraphResult {
  const analyzed = snapshot.files.filter((f) => f.status === "analyzed");
  const indexedPaths = new Set(analyzed.map((f) => f.path));
  const filesByPath = new Map(analyzed.map((f) => [f.path, f]));
  const { symbols, byPath, byPathName } = buildSymbolIndex(snapshot.files);
  const packages = discoverLocalPackages(
    snapshot.rootPath,
    snapshot.files.map((f) => f.path),
    indexedPaths,
  );
  const aliases = loadTsconfigPathAliases(
    snapshot.rootPath,
    snapshot.files.map((f) => f.path),
  );

  const fileNodes = nodesFromIndexSnapshot(snapshot);
  const symbolNodes: GraphNodeDto[] = symbols.map((s) => ({
    id: unsafeNodeId(s.id),
    kind: s.nodeKind,
    label: s.name,
    attrs: {
      path: s.path,
      symbolKind: s.kind,
      start: s.start,
      end: s.end,
      exported: s.exported,
    },
  }));

  const edges = new Map<string, GraphEdgeDto>();
  const references: ReferenceHit[] = [];

  for (const s of symbols) {
    addEdge(edges, "defines", fileNodeId(s.path), s.id, {
      name: s.name,
    });
    addEdge(edges, "contains", fileNodeId(s.path), s.id);
  }

  for (const file of analyzed) {
    const fileSymbols = byPath.get(file.path) ?? [];
    for (const ref of file.references) {
      if (!ref.name) continue;
      const target = resolveReferenceTarget(
        file,
        ref,
        indexedPaths,
        filesByPath,
        byPath,
        byPathName,
        packages,
        aliases,
      );
      references.push({
        name: ref.name,
        kind: ref.kind,
        path: file.path,
        start: ref.start,
        end: ref.end,
        targetSymbolId: target?.id ?? null,
      });

      if (!target) continue;

      if (ref.kind === "extends" || ref.kind === "implements") {
        const fromSym =
          enclosingSymbol(fileSymbols, ref.start) ??
          fileSymbols.find((s) => s.kind === "class" || s.kind === "interface");
        if (fromSym && fromSym.id !== target.id) {
          addEdge(edges, ref.kind, fromSym.id, target.id, {
            path: file.path,
            start: ref.start,
            end: ref.end,
          });
        }
        continue;
      }

      // call / other → references edge (prefer from enclosing symbol, else file)
      const fromSym = enclosingSymbol(fileSymbols, ref.start);
      const fromId = fromSym?.id ?? fileNodeId(file.path);
      if (fromId !== target.id) {
        addEdge(edges, "references", fromId, target.id, {
          refKind: ref.kind,
          path: file.path,
          start: ref.start,
          end: ref.end,
          name: ref.name,
        });
      }
    }

    if (isTestPath(file.path)) {
      for (const imp of file.imports) {
        const targetPath = resolveModuleTarget(
          file.path,
          imp.source,
          indexedPaths,
          packages,
          aliases,
        );
        if (!targetPath || targetPath === file.path) continue;
        addEdge(edges, "tests", fileNodeId(file.path), fileNodeId(targetPath), {
          source: imp.source,
        });
      }
    }
  }

  const nodes = [...fileNodes, ...symbolNodes].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const edgeList = [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));
  references.sort((a, b) =>
    `${a.path}\0${a.start}\0${a.name}`.localeCompare(
      `${b.path}\0${b.start}\0${b.name}`,
    ),
  );

  const graph: GraphSnapshotDto = {
    id: `kg:${snapshot.repoId}`,
    nodes,
    edges: edgeList,
  };

  return {
    graph,
    stats: {
      nodes: nodes.length,
      edges: edgeList.length,
      nodesByKind: countBy(nodes),
      edgesByKind: countBy(edgeList),
    },
    symbols: symbols.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      path: s.path,
      start: s.start,
      end: s.end,
      exported: s.exported,
    })),
    references,
  };
}

export function findSymbol(
  result: KnowledgeGraphResult,
  query: FindSymbolQuery,
): SymbolHit[] {
  return result.symbols
    .filter((s) => {
      if (s.name !== query.name) return false;
      if (query.path !== undefined && s.path !== query.path) return false;
      if (query.kind !== undefined && s.kind !== query.kind) return false;
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function findReferences(
  result: KnowledgeGraphResult,
  query: FindReferencesQuery,
): ReferenceHit[] {
  const targets = new Set(
    result.symbols
      .filter((s) => {
        if (s.name !== query.name) return false;
        if (query.path !== undefined && s.path !== query.path) return false;
        if (query.start !== undefined && s.start !== query.start) return false;
        return true;
      })
      .map((s) => s.id),
  );
  if (targets.size === 0) return [];

  return result.references
    .filter((r) => r.targetSymbolId !== null && targets.has(r.targetSymbolId))
    .sort((a, b) =>
      `${a.path}\0${a.start}`.localeCompare(`${b.path}\0${b.start}`),
    );
}
