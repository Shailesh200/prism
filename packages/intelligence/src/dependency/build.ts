import { nodesFromIndexSnapshot } from "@prism/graph-engine";
import {
  type GraphEdgeDto,
  type GraphNodeDto,
  type GraphSnapshotDto,
  type IndexSnapshot,
  unsafeEdgeId,
  unsafeNodeId,
} from "@prism/shared";
import { findCycles } from "./cycles.js";
import {
  discoverLocalPackages,
  packageForFile,
  packageNodeId,
  type LocalPackage,
} from "./packages.js";
import {
  barePackageName,
  isBarePackageSpecifier,
  isRelativeSpecifier,
  resolveImportTarget,
} from "./resolve.js";

export type DependencyGraphOptions = {
  /** Aggregate to local package nodes (reads package.json under rootPath). */
  readonly packageAggregation?: boolean;
};

export type UnresolvedDependency = {
  readonly from: string;
  readonly source: string;
  readonly kind: "import" | "re-export";
  readonly reason: string;
};

export type DependencyGraphResult = {
  readonly graph: GraphSnapshotDto;
  readonly cycles: string[][];
  readonly unresolved: UnresolvedDependency[];
};

type FileEdge = {
  fromPath: string;
  toPath: string;
  kind: "import" | "re-export";
  source: string;
};

function fileNodeId(path: string): string {
  return unsafeNodeId(`file:${path}`);
}

function edgeId(kind: string, from: string, to: string): string {
  return unsafeEdgeId(`${kind}:${from}->${to}`);
}

function collectFileEdges(
  snapshot: IndexSnapshot,
  indexedPaths: ReadonlySet<string>,
): { edges: FileEdge[]; unresolved: UnresolvedDependency[] } {
  const edges: FileEdge[] = [];
  const unresolved: UnresolvedDependency[] = [];
  const seen = new Set<string>();

  const pushEdge = (e: FileEdge) => {
    const key = `${e.kind}\0${e.fromPath}\0${e.toPath}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(e);
  };

  for (const file of snapshot.files) {
    if (file.status !== "analyzed") continue;

    for (const imp of file.imports) {
      if (!isRelativeSpecifier(imp.source)) {
        if (isBarePackageSpecifier(imp.source)) {
          unresolved.push({
            from: file.path,
            source: imp.source,
            kind: "import",
            reason: "bare_specifier",
          });
        } else {
          unresolved.push({
            from: file.path,
            source: imp.source,
            kind: "import",
            reason: "unsupported_specifier",
          });
        }
        continue;
      }
      const target = resolveImportTarget(file.path, imp.source, indexedPaths);
      if (!target) {
        unresolved.push({
          from: file.path,
          source: imp.source,
          kind: "import",
          reason: "unresolved_relative",
        });
        continue;
      }
      pushEdge({
        fromPath: file.path,
        toPath: target,
        kind: "import",
        source: imp.source,
      });
    }

    for (const exp of file.exports) {
      if (exp.source === undefined) continue;
      if (!isRelativeSpecifier(exp.source)) {
        unresolved.push({
          from: file.path,
          source: exp.source,
          kind: "re-export",
          reason: isBarePackageSpecifier(exp.source)
            ? "bare_specifier"
            : "unsupported_specifier",
        });
        continue;
      }
      const target = resolveImportTarget(file.path, exp.source, indexedPaths);
      if (!target) {
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
    attrs: { source: e.source },
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
  ) => {
    const id = edgeId(kind, fromId, toId);
    if (edgeMap.has(id)) return;
    edgeMap.set(id, {
      id,
      kind,
      from: unsafeNodeId(fromId),
      to: unsafeNodeId(toId),
      attrs: attrs as GraphEdgeDto["attrs"],
    });
  };

  for (const e of fileEdges) {
    const fromPkg = packageForFile(e.fromPath, packages);
    const toPkg = packageForFile(e.toPath, packages);
    if (!fromPkg || !toPkg) continue;
    if (fromPkg.name === toPkg.name) continue; // intra-package
    addEdge(e.kind, packageNodeId(fromPkg.name), packageNodeId(toPkg.name), {
      via: `${e.fromPath}->${e.toPath}`,
      source: e.source,
    });
  }

  // Bare imports → external package nodes (no registry fetch)
  for (const u of unresolved) {
    if (u.reason !== "bare_specifier") continue;
    const fromPkg = packageForFile(u.from, packages);
    if (!fromPkg) continue;
    const name = barePackageName(u.source);
    ensurePkg(name, { local: false });
    addEdge("import", packageNodeId(fromPkg.name), packageNodeId(name), {
      source: u.source,
      external: true,
    });
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
 * Build a dependency graph from an index snapshot.
 * Relative imports/re-exports only for file edges; bare specs for package mode.
 */
export function buildDependencyGraph(
  snapshot: IndexSnapshot,
  options: DependencyGraphOptions = {},
): DependencyGraphResult {
  const indexedPaths = new Set(
    snapshot.files.filter((f) => f.status === "analyzed").map((f) => f.path),
  );
  const { edges: fileEdges, unresolved } = collectFileEdges(
    snapshot,
    indexedPaths,
  );

  let graph: GraphSnapshotDto;
  if (options.packageAggregation) {
    const packages = discoverLocalPackages(
      snapshot.rootPath,
      snapshot.files.map((f) => f.path),
    );
    graph = buildPackageGraph(snapshot, fileEdges, packages, unresolved);
  } else {
    graph = buildFileGraph(snapshot, fileEdges);
  }

  const cycles = findCycles(
    graph.nodes.map((n) => n.id),
    graph.edges.map((e) => ({ from: e.from, to: e.to })),
  );

  return { graph, cycles, unresolved };
}
