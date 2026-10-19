import { nodesFromIndexSnapshot } from "@repo-prism/graph-engine";
import {
  isTypeDeclarationPath,
  type GraphEdgeDto,
  type GraphNodeDto,
  type GraphSnapshotDto,
  type IndexSnapshot,
  unsafeEdgeId,
  unsafeNodeId,
} from "@repo-prism/shared";
import { findCycles } from "./cycles.js";
import {
  discoverLocalPackages,
  packageForFile,
  packageNodeId,
  resolveLocalPackageSpecifier,
  type LocalPackage,
} from "./packages.js";
import {
  barePackageName,
  isBarePackageSpecifier,
  isRelativeSpecifier,
  resolveImportTarget,
  resolveRelativePath,
} from "./resolve.js";
import { loadTsconfigPathAliases, resolveAliasSpecifier } from "./aliases.js";

export type DependencyGraphOptions = {
  /** Aggregate to local package nodes (reads package.json under rootPath). */
  readonly packageAggregation?: boolean;
  /** Enable best-effort tsconfig paths / package imports aliases (default true). */
  readonly resolveAliases?: boolean;
  /**
   * Count type-only edges when finding cycles (plan §4.1). Default false: a
   * loop held together only by `import type` cannot fail at runtime.
   */
  readonly includeTypes?: boolean;
};

export type UnresolvedDependency = {
  readonly from: string;
  readonly source: string;
  readonly kind: "import" | "re-export" | "require";
  readonly reason: string;
  /**
   * A bare specifier naming no package in this workspace (`react`,
   * `@nestjs/common`): an installed dependency, not a gap in the local graph.
   */
  readonly external?: true;
};

/**
 * Readonly throughout, and deliberately so: `buildDependencyGraph` hands the
 * same object to every caller that asks for it, so a mutable array here would
 * let one report quietly rewrite another's input.
 */
export type DependencyGraphResult = {
  readonly graph: GraphSnapshotDto;
  readonly cycles: readonly (readonly string[])[];
  readonly unresolved: readonly UnresolvedDependency[];
};

type FileEdge = {
  fromPath: string;
  toPath: string;
  kind: "import" | "re-export" | "require";
  source: string;
  /** Named import/export bindings when known (for evidence). */
  specifiers?: readonly string[];
  /** True for edges originating in `.d.ts` (M-059 / P-E7). */
  typeOnly?: boolean;
  /**
   * Import edges: the target's export names this edge binds (`*` = whole
   * module). Undefined means unknown (dynamic import, require): every export.
   */
  imported?: string[];
  /** Re-export edges: `{ from: name in target, as: name exported here }`. */
  reexports?: { from: string; as: string }[];
  provenance: "measured" | "heuristic";
};

function fileNodeId(path: string): string {
  return unsafeNodeId(`file:${path}`);
}

function edgeId(kind: string, from: string, to: string): string {
  return unsafeEdgeId(`${kind}:${from}->${to}`);
}

function resolveNonRelativeTarget(
  fromFile: string,
  source: string,
  indexedPaths: ReadonlySet<string>,
  packages: readonly LocalPackage[],
  aliases: ReturnType<typeof loadTsconfigPathAliases>,
  resolveAliases: boolean,
): string | null {
  if (resolveAliases && aliases.rules.length > 0) {
    const aliasHit = resolveAliasSpecifier(
      fromFile,
      source,
      indexedPaths,
      aliases,
    );
    if (aliasHit) return aliasHit;
  }
  return resolveLocalPackageSpecifier(source, packages, indexedPaths);
}

function collectFileEdges(
  snapshot: IndexSnapshot,
  indexedPaths: ReadonlySet<string>,
  packages: readonly LocalPackage[],
  resolveAliases = true,
): { edges: FileEdge[]; unresolved: UnresolvedDependency[] } {
  const edges: FileEdge[] = [];
  const unresolved: UnresolvedDependency[] = [];
  const aliases = resolveAliases
    ? loadTsconfigPathAliases(
        snapshot.rootPath,
        snapshot.files.map((f) => f.path),
      )
    : { rules: [], configs: [] };

  const localNames = new Set(packages.map((p) => p.name));
  /** No workspace package and no path alias claims it: an installed dependency. */
  const isExternal = (source: string): boolean =>
    !localNames.has(barePackageName(source)) &&
    !aliases.rules.some((rule) => source.startsWith(rule.prefix));
  const seen = new Map<string, FileEdge>();
  const pushEdge = (e: FileEdge) => {
    const key = `${e.kind}\0${e.fromPath}\0${e.toPath}`;
    const prior = seen.get(key);
    if (prior) {
      // One value import between the same two files makes the edge a value
      // edge, whichever statement came first.
      if (prior.typeOnly && !e.typeOnly) delete prior.typeOnly;
      // Bound names union; an unknown binding (undefined) means "everything".
      if (prior.imported && e.imported) {
        prior.imported = [...new Set([...prior.imported, ...e.imported])];
      } else if (e.kind !== "re-export") {
        delete prior.imported;
      }
      if (e.reexports) {
        prior.reexports = [...(prior.reexports ?? []), ...e.reexports];
      }
      return;
    }
    seen.set(key, e);
    edges.push(e);
  };

  for (const file of snapshot.files) {
    if (file.status !== "analyzed") continue;
    const fromDts = isTypeDeclarationPath(file.path);

    for (const imp of file.imports) {
      const edgeKind = imp.kind === "require" ? "require" : "import";
      const typeOnly = fromDts || imp.typeOnly === true;
      if (!isRelativeSpecifier(imp.source)) {
        const hit = resolveNonRelativeTarget(
          file.path,
          imp.source,
          indexedPaths,
          packages,
          aliases,
          resolveAliases,
        );
        if (hit) {
          pushEdge({
            fromPath: file.path,
            toPath: hit,
            kind: edgeKind,
            source: imp.source,
            provenance: "heuristic",
            ...(imp.specifiers.length > 0
              ? { specifiers: imp.specifiers }
              : {}),
            ...(imp.imported ? { imported: [...imp.imported] } : {}),
            ...(typeOnly ? { typeOnly: true } : {}),
          });
          continue;
        }
        if (isBarePackageSpecifier(imp.source)) {
          unresolved.push({
            from: file.path,
            source: imp.source,
            kind: edgeKind,
            reason: "bare_specifier",
            ...(isExternal(imp.source) ? { external: true as const } : {}),
          });
        } else {
          unresolved.push({
            from: file.path,
            source: imp.source,
            kind: edgeKind,
            reason: "unsupported_specifier",
          });
        }
        continue;
      }
      const target = resolveImportTarget(file.path, imp.source, indexedPaths);
      if (!target) {
        // Relative import of a package root directory (../admin-config)
        const asDir = resolveRelativePathToPackageEntry(
          file.path,
          imp.source,
          packages,
          indexedPaths,
        );
        if (asDir) {
          pushEdge({
            fromPath: file.path,
            toPath: asDir,
            kind: edgeKind,
            source: imp.source,
            provenance: "heuristic",
            ...(imp.specifiers.length > 0
              ? { specifiers: imp.specifiers }
              : {}),
            ...(imp.imported ? { imported: [...imp.imported] } : {}),
            ...(typeOnly ? { typeOnly: true } : {}),
          });
          continue;
        }
        unresolved.push({
          from: file.path,
          source: imp.source,
          kind: edgeKind,
          reason: "unresolved_relative",
        });
        continue;
      }
      pushEdge({
        fromPath: file.path,
        toPath: target,
        kind: edgeKind,
        source: imp.source,
        provenance: "measured",
        ...(imp.specifiers.length > 0 ? { specifiers: imp.specifiers } : {}),
        ...(imp.imported ? { imported: [...imp.imported] } : {}),
        ...(typeOnly ? { typeOnly: true } : {}),
      });
    }

    for (const exp of file.exports) {
      if (exp.source === undefined) continue;
      const typeOnly = fromDts || exp.typeOnly === true;
      if (!isRelativeSpecifier(exp.source)) {
        const hit = resolveNonRelativeTarget(
          file.path,
          exp.source,
          indexedPaths,
          packages,
          aliases,
          resolveAliases,
        );
        if (hit) {
          pushEdge({
            fromPath: file.path,
            toPath: hit,
            kind: "re-export",

            source: exp.source,

            reexports: [{ from: exp.importedName ?? exp.name, as: exp.name }],
            provenance: "heuristic",
            ...(typeOnly ? { typeOnly: true } : {}),
          });
          continue;
        }
        const bare = isBarePackageSpecifier(exp.source);
        unresolved.push({
          from: file.path,
          source: exp.source,
          kind: "re-export",
          reason: bare ? "bare_specifier" : "unsupported_specifier",
          ...(bare && isExternal(exp.source)
            ? { external: true as const }
            : {}),
        });
        continue;
      }
      const target = resolveImportTarget(file.path, exp.source, indexedPaths);
      if (!target) {
        const asDir = resolveRelativePathToPackageEntry(
          file.path,
          exp.source,
          packages,
          indexedPaths,
        );
        if (asDir) {
          pushEdge({
            fromPath: file.path,
            toPath: asDir,
            kind: "re-export",

            source: exp.source,

            reexports: [{ from: exp.importedName ?? exp.name, as: exp.name }],
            provenance: "heuristic",
            ...(typeOnly ? { typeOnly: true } : {}),
          });
          continue;
        }
        unresolved.push({
          from: file.path,
          source: exp.source,
          kind: "re-export",
          reason: "unresolved_relative",
        });
        continue;
      }
      pushEdge({
        fromPath: file.path,
        toPath: target,
        kind: "re-export",

        source: exp.source,

        reexports: [{ from: exp.importedName ?? exp.name, as: exp.name }],
        provenance: "measured",
        ...(typeOnly ? { typeOnly: true } : {}),
      });
    }
  }

  return {
    edges: edges.sort((a, b) => {
      const ka = `${a.kind}\0${a.fromPath}\0${a.toPath}`;
      const kb = `${b.kind}\0${b.fromPath}\0${b.toPath}`;
      return ka.localeCompare(kb);
    }),
    unresolved: unresolved.sort((a, b) =>
      `${a.from}\0${a.kind}\0${a.source}`.localeCompare(
        `${b.from}\0${b.kind}\0${b.source}`,
      ),
    ),
  };
}

/**
 * When `./pkg` / `../pkg` lands on a local package root (not an indexed file),
 * map to that package's entry file.
 */
function resolveRelativePathToPackageEntry(
  fromFile: string,
  specifier: string,
  packages: readonly LocalPackage[],
  indexedPaths: ReadonlySet<string>,
): string | null {
  const dir = resolveRelativePath(fromFile, specifier);
  if (!dir) return null;
  for (const pkg of packages) {
    if (
      pkg.rootDir === dir &&
      pkg.entryPath &&
      indexedPaths.has(pkg.entryPath)
    ) {
      return pkg.entryPath;
    }
  }
  return null;
}

function buildFileGraph(
  snapshot: IndexSnapshot,
  fileEdges: FileEdge[],
): GraphSnapshotDto {
  const nodes = nodesFromIndexSnapshot(snapshot);
  const edges: GraphEdgeDto[] = fileEdges.map((e) => ({
    id: edgeId(e.kind, fileNodeId(e.fromPath), fileNodeId(e.toPath)),
    kind: e.kind,
    from: fileNodeId(e.fromPath),
    to: fileNodeId(e.toPath),
    provenance: e.provenance,
    attrs: {
      source: e.source,
      ...(e.specifiers && e.specifiers.length > 0
        ? { specifiers: [...e.specifiers] }
        : {}),
      ...(e.typeOnly ? { typeOnly: true } : {}),
      ...(e.imported ? { imported: [...e.imported] } : {}),
      ...(e.reexports
        ? { reexports: e.reexports.map((r) => ({ from: r.from, as: r.as })) }
        : {}),
    },
  }));
  return {
    id: `deps:${snapshot.repoId}`,
    nodes,
    edges,
  };
}

function buildPackageGraph(
  snapshot: IndexSnapshot,
  fileEdges: FileEdge[],
  packages: readonly LocalPackage[],
  unresolved: readonly UnresolvedDependency[],
): GraphSnapshotDto {
  const nodeMap = new Map<string, GraphNodeDto>();
  const ensurePkg = (name: string, attrs: Record<string, unknown>) => {
    const id = packageNodeId(name);
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id: unsafeNodeId(id),
        kind: "package",
        label: name,
        attrs: attrs as GraphNodeDto["attrs"],
      });
    }
  };

  const usedLocal = new Set<string>();
  for (const file of snapshot.files) {
    if (file.status !== "analyzed") continue;
    const pkg = packageForFile(file.path, packages);
    if (pkg) usedLocal.add(pkg.name);
  }
  for (const pkg of packages) {
    if (!usedLocal.has(pkg.name)) continue;
    ensurePkg(pkg.name, {
      rootDir: pkg.rootDir,
      local: true,
    });
  }

  const edgeMap = new Map<string, GraphEdgeDto>();
  const addEdge = (
    kind: string,
    fromId: string,
    toId: string,
    attrs: Record<string, unknown>,
    provenance?: GraphEdgeDto["provenance"],
  ) => {
    const id = edgeId(kind, fromId, toId);
    const prior = edgeMap.get(id);
    if (prior) {
      // A package edge is type-only only while every file edge behind it is.
      if (prior.attrs?.typeOnly && !attrs.typeOnly) {
        const { typeOnly: _drop, ...rest } = prior.attrs;
        edgeMap.set(id, { ...prior, attrs: rest as GraphEdgeDto["attrs"] });
      }
      return;
    }
    edgeMap.set(id, {
      id,
      kind,
      from: unsafeNodeId(fromId),
      to: unsafeNodeId(toId),
      attrs: attrs as GraphEdgeDto["attrs"],
      ...(provenance === undefined ? {} : { provenance }),
    });
  };

  for (const e of fileEdges) {
    const fromPkg = packageForFile(e.fromPath, packages);
    const toPkg = packageForFile(e.toPath, packages);
    if (!fromPkg || !toPkg) continue;
    if (fromPkg.name === toPkg.name) continue; // intra-package
    addEdge(
      e.kind,
      packageNodeId(fromPkg.name),
      packageNodeId(toPkg.name),
      {
        via: `${e.fromPath}->${e.toPath}`,
        source: e.source,
        ...(e.typeOnly ? { typeOnly: true } : {}),
      },
      e.provenance,
    );
  }

  // Bare imports → external package nodes (no registry fetch).
  // Local packages with unresolved entries still link as local.
  for (const u of unresolved) {
    if (u.reason !== "bare_specifier") continue;
    const fromPkg = packageForFile(u.from, packages);
    if (!fromPkg) continue;
    const name = barePackageName(u.source);
    const local = packages.find((p) => p.name === name);
    if (local) {
      ensurePkg(name, { rootDir: local.rootDir, local: true });
      addEdge(
        "import",
        packageNodeId(fromPkg.name),
        packageNodeId(name),
        {
          source: u.source,
          unresolvedEntry: true,
        },
        "heuristic",
      );
      continue;
    }
    ensurePkg(name, { local: false });
    addEdge(
      "import",
      packageNodeId(fromPkg.name),
      packageNodeId(name),
      {
        source: u.source,
        external: true,
      },
      "heuristic",
    );
  }

  const nodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));

  return {
    id: `deps-pkg:${snapshot.repoId}`,
    nodes,
    edges,
  };
}

/**
 * Dependency graphs, memoised per index snapshot.
 *
 * Almost every report starts by building this graph, and several build it more
 * than once: the engineering report alone called it three times, and a single
 * screen in the extension can ask for it half a dozen times over. Each call
 * re-resolved every import in the repository — about 240 ms on a 10k-file
 * workspace, 2 s on a 50k one (M-035).
 *
 * Keyed on the snapshot *object* rather than on `indexedAt`: the timestamp has
 * millisecond resolution, so two reindexes inside the same millisecond would
 * share a key and one of them would read a stale graph. Snapshots are replaced
 * wholesale and never mutated, so object identity answers exactly the question
 * the cache needs to ask, and a WeakMap lets an abandoned snapshot take its
 * graphs with it.
 *
 * The returned value is shared between callers. That is safe because
 * `DependencyGraphResult` is readonly throughout, so a caller that wants to
 * change the graph has to build a new one — which is what the layer-signal
 * annotation and the map builder already do.
 */
const graphCache = new WeakMap<
  IndexSnapshot,
  Map<string, DependencyGraphResult>
>();

/**
 * Build a dependency graph from an index snapshot.
 * Relative + local package-name / entry imports for file edges; bare external
 * specs remain unresolved (package aggregation mode only).
 */
export function buildDependencyGraph(
  snapshot: IndexSnapshot,
  options: DependencyGraphOptions = {},
): DependencyGraphResult {
  const key = `${options.packageAggregation ?? false}\0${options.resolveAliases ?? true}\0${options.includeTypes ?? false}`;

  let perOptions = graphCache.get(snapshot);
  if (!perOptions) {
    perOptions = new Map();
    graphCache.set(snapshot, perOptions);
  }

  const hit = perOptions.get(key);
  if (hit) return hit;

  const built = computeDependencyGraph(snapshot, options);
  perOptions.set(key, built);
  return built;
}

function computeDependencyGraph(
  snapshot: IndexSnapshot,
  options: DependencyGraphOptions,
): DependencyGraphResult {
  const indexedPaths = new Set(
    snapshot.files.filter((f) => f.status === "analyzed").map((f) => f.path),
  );
  const packages = discoverLocalPackages(
    snapshot.rootPath,
    snapshot.files.map((f) => f.path),
    indexedPaths,
  );
  const { edges: fileEdges, unresolved } = collectFileEdges(
    snapshot,
    indexedPaths,
    packages,
    options.resolveAliases !== false,
  );

  let graph: GraphSnapshotDto;
  if (options.packageAggregation) {
    graph = buildPackageGraph(snapshot, fileEdges, packages, unresolved);
  } else {
    graph = buildFileGraph(snapshot, fileEdges);
  }

  const cycleEdges = options.includeTypes
    ? graph.edges
    : graph.edges.filter((e) => e.attrs?.typeOnly !== true);
  const cycles = findCycles(
    graph.nodes.map((n) => n.id),
    cycleEdges.map((e) => ({ from: e.from, to: e.to })),
  );

  return { graph, cycles, unresolved };
}
