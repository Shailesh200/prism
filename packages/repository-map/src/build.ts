import { layoutGraph } from "@prism/graph-engine";
import type {
  FeatureInfo,
  GitCommitRef,
  GitContributor,
  GitFileSignal,
  GitRepoSummary,
  GraphEdgeDto,
  GraphNodeDto,
  GraphSnapshotDto,
  IndexSnapshot,
  JsonValue,
  Landmark,
  MapBookmark,
  MapCluster,
  MapLayerDescriptor,
  MapSearchHit,
  MapZoomLevel,
  RepositoryMap,
} from "@prism/shared";
import {
  annotateGraphWithLayerSignals,
  computeLayerSignals,
} from "./layer-signals.js";
import { listMapLayerDescriptors, resolveActiveLayers } from "./layers.js";
import { clusteringNoteFor } from "./zoom.js";

export type MapPackageInfo = {
  readonly name: string;
  readonly rootDir: string;
};

export type BuildRepositoryMapInput = {
  readonly snapshot: IndexSnapshot;
  readonly dependencyGraph: GraphSnapshotDto;
  readonly features: readonly FeatureInfo[];
  readonly landmarks: readonly Landmark[];
  readonly packages: readonly MapPackageInfo[];
  readonly bookmarks?: readonly MapBookmark[];
  readonly zoom?: MapZoomLevel;
  readonly layers?: readonly string[];
  readonly generatedAt?: string;
  /** Per-file local git history (ADR-0013). Absent on non-git roots. */
  readonly gitSignals?: ReadonlyMap<string, GitFileSignal>;
  /** Repo-level git summary. */
  readonly gitSummary?: GitRepoSummary;
};

function node(
  id: string,
  kind: string,
  label: string,
  attrs?: Record<string, JsonValue>,
): GraphNodeDto {
  return {
    id,
    kind,
    label,
    ...(attrs === undefined ? {} : { attrs }),
  };
}

function edge(
  id: string,
  kind: string,
  from: string,
  to: string,
): GraphEdgeDto {
  return { id, kind, from, to };
}

function packageId(pkg: MapPackageInfo): string {
  return `pkg:${pkg.name}`;
}

function buildRepoZoom(
  packages: readonly MapPackageInfo[],
  rootPath: string,
): { graph: GraphSnapshotDto; clusters: MapCluster[] } {
  const workspaceId = "map:workspace";
  const nodes: GraphNodeDto[] = [
    node(workspaceId, "workspace", "workspace", { rootPath }),
  ];
  const edges: GraphEdgeDto[] = [];
  const memberIds: string[] = [];
  for (const pkg of packages) {
    const id = packageId(pkg);
    memberIds.push(id);
    nodes.push(node(id, "package", pkg.name, { rootDir: pkg.rootDir || "." }));
    edges.push(edge(`map:contains:${id}`, "contains", workspaceId, id));
  }
  if (packages.length === 0) {
    memberIds.push(workspaceId);
  }
  return {
    graph: { id: "map:repo", nodes, edges },
    clusters: [
      {
        id: "cluster:workspace",
        label: "workspace",
        zoom: "repo",
        memberNodeIds: memberIds,
        childZoom: "package",
      },
    ],
  };
}

function buildPackageZoom(
  packages: readonly MapPackageInfo[],
  dependencyGraph: GraphSnapshotDto,
): { graph: GraphSnapshotDto; clusters: MapCluster[] } {
  if (packages.length === 0) {
    return {
      graph: {
        id: "map:package",
        nodes: [node("pkg:.", "package", "workspace", { rootDir: "." })],
        edges: [],
      },
      clusters: [],
    };
  }

  const byRoot = [...packages].sort(
    (a, b) => b.rootDir.length - a.rootDir.length,
  );
  const pkgOf = (filePath: string): string | null => {
    const bare = filePath.replace(/^file:/, "");
    for (const pkg of byRoot) {
      if (pkg.rootDir === "") continue;
      if (bare === pkg.rootDir || bare.startsWith(`${pkg.rootDir}/`)) {
        return packageId(pkg);
      }
    }
    const root = byRoot.find((p) => p.rootDir === "");
    return root ? packageId(root) : null;
  };

  const fileCountByPkg = new Map<string, number>();
  for (const n of dependencyGraph.nodes) {
    if (n.kind !== "file") continue;
    const pkg = pkgOf(n.id);
    if (!pkg) continue;
    fileCountByPkg.set(pkg, (fileCountByPkg.get(pkg) ?? 0) + 1);
  }

  const nodes = packages.map((pkg) => {
    const id = packageId(pkg);
    return node(id, "package", pkg.name, {
      rootDir: pkg.rootDir || ".",
      fileCount: fileCountByPkg.get(id) ?? 0,
    });
  });

  const edgeSet = new Set<string>();
  const edges: GraphEdgeDto[] = [];
  for (const e of dependencyGraph.edges) {
    const from = pkgOf(e.from);
    const to = pkgOf(e.to);
    if (!from || !to || from === to) continue;
    const key = `${from}->${to}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push(edge(`map:dep:${key}`, "depends-on", from, to));
  }

  const clusters: MapCluster[] = packages.map((pkg) => ({
    id: `cluster:${packageId(pkg)}`,
    label: pkg.name,
    zoom: "package" as const,
    memberNodeIds: [packageId(pkg)],
    childZoom: "feature" as const,
  }));

  return {
    graph: { id: "map:package", nodes, edges },
    clusters,
  };
}

/**
 * The first two path segments, which is what "features live near each other"
 * means here. Written without `split` because it runs once per member file
 * across the whole repository.
 */
function directoryPrefix(path: string): string {
  const first = path.indexOf("/");
  if (first === -1) return path;
  const second = path.indexOf("/", first + 1);
  return second === -1 ? path : path.slice(0, second);
}

function buildFeatureZoom(features: readonly FeatureInfo[]): {
  graph: GraphSnapshotDto;
  clusters: MapCluster[];
} {
  const nodes = features.map((f) =>
    node(`feature:${f.id}`, "feature", f.name, {
      slug: f.slug,
      confidence: f.confidence,
      memberFiles: [...f.memberFiles].sort((a, b) => a.localeCompare(b)),
    }),
  );
  const edges: GraphEdgeDto[] = [];

  // Link features that share a directory prefix.
  //
  // The obvious phrasing — for each pair of features, for each pair of their
  // member files, compare prefixes — is O(features² × members²) and splits two
  // paths on every comparison. On a 10,000 file repository that was 28 of the
  // 32 seconds a map build took (M-035). Deriving each feature's prefix set
  // once makes the pair test a set lookup, and the answer is identical: two
  // features share a prefix exactly when their prefix sets intersect.
  const prefixes = features.map((f) => {
    const set = new Set<string>();
    for (const file of f.memberFiles) set.add(directoryPrefix(file));
    return set;
  });

  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i]!;
      const b = features[j]!;
      // Probe the smaller set against the larger; the result does not depend
      // on which way round, but the cost does.
      const [small, large] =
        prefixes[i]!.size <= prefixes[j]!.size
          ? [prefixes[i]!, prefixes[j]!]
          : [prefixes[j]!, prefixes[i]!];

      let shared = false;
      for (const prefix of small) {
        if (large.has(prefix)) {
          shared = true;
          break;
        }
      }
      if (!shared) continue;

      edges.push(
        edge(
          `map:feat:${a.id}:${b.id}`,
          "related",
          `feature:${a.id}`,
          `feature:${b.id}`,
        ),
      );
    }
  }
  const clusters = features.map((f) => ({
    id: `cluster:feature:${f.id}`,
    label: f.name,
    zoom: "feature" as const,
    memberNodeIds: [`feature:${f.id}`],
    childZoom: "file" as const,
  }));
  return {
    graph: { id: "map:feature", nodes, edges },
    clusters,
  };
}

function buildFileZoom(dependencyGraph: GraphSnapshotDto): {
  graph: GraphSnapshotDto;
  clusters: MapCluster[];
} {
  return {
    graph: {
      id: "map:file",
      nodes: [...dependencyGraph.nodes].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      edges: [...dependencyGraph.edges].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    },
    clusters: [],
  };
}

function buildSymbolZoom(snapshot: IndexSnapshot): {
  graph: GraphSnapshotDto;
  clusters: MapCluster[];
} {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  const files = [...snapshot.files].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  for (const file of files) {
    const fileId = `file:${file.path}`;
    const symbols = [...file.symbols]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
    for (const sym of symbols) {
      const id = `sym:${file.path}:${sym.name}`;
      nodes.push(
        node(id, "symbol", sym.name, {
          path: file.path,
          symbolKind: sym.kind,
        }),
      );
      edges.push(edge(`map:owns:${id}`, "contains", fileId, id));
      if (!nodes.some((n) => n.id === fileId)) {
        nodes.push(node(fileId, "file", file.path, { path: file.path }));
      }
    }
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));
  return {
    graph: { id: "map:symbol", nodes, edges },
    clusters: [],
  };
}

/**
 * Attach `attrs.weight` (relative size for treemap area) and, where known, a
 * `scopePrefix` drill pointer. Weight = analyzed-file count under a node's
 * scope; symbols/files fall back to a small intrinsic size.
 */
function annotateWeights(
  graph: GraphSnapshotDto,
  snapshot: IndexSnapshot,
): GraphSnapshotDto {
  const analyzed = snapshot.files.filter((f) => f.status === "analyzed");
  const symbolsByPath = new Map(
    analyzed.map((f) => [f.path, f.symbols.length]),
  );
  const paths = analyzed.map((f) => f.path);
  const countUnder = (prefix: string): number => {
    const p = prefix.replace(/\/$/, "");
    if (p === "" || p === ".") return paths.length;
    return paths.filter((fp) => fp === p || fp.startsWith(`${p}/`)).length;
  };

  const nodes = graph.nodes.map((n) => {
    const path =
      typeof n.attrs?.path === "string"
        ? n.attrs.path
        : n.kind === "file"
          ? n.label
          : null;
    let weight = 1;
    let scopePrefix: string | null = null;
    if (n.kind === "symbol") {
      weight = 1;
    } else if (path) {
      weight = (symbolsByPath.get(path) ?? 0) + 1;
      scopePrefix = path;
    } else if (n.kind === "workspace") {
      weight = Math.max(1, paths.length);
    } else if (n.kind === "package") {
      const rootDir =
        typeof n.attrs?.rootDir === "string" ? n.attrs.rootDir : "";
      weight = Math.max(1, countUnder(rootDir));
      scopePrefix = rootDir;
    } else if (Array.isArray(n.attrs?.memberFiles)) {
      weight = Math.max(1, n.attrs.memberFiles.length);
    }
    return {
      ...n,
      attrs: {
        ...n.attrs,
        weight,
        ...(scopePrefix === null ? {} : { scopePrefix }),
      },
    };
  });
  return { ...graph, nodes };
}

function gitAttrForFile(sig: GitFileSignal): JsonValue {
  return {
    lastCommit: sig.lastCommit,
    commits: sig.commits,
    additions: sig.additions,
    deletions: sig.deletions,
    contributors: sig.contributors.slice(0, 5),
    recent: sig.recent.slice(0, 5),
    weeks: sig.weeks,
  } as unknown as JsonValue;
}

function rollupGit(sigs: readonly GitFileSignal[]): JsonValue | null {
  if (sigs.length === 0) return null;
  let commits = 0;
  let additions = 0;
  let deletions = 0;
  let last: GitCommitRef | null = null;
  const byAuthor = new Map<string, GitContributor>();
  const recentAll: GitCommitRef[] = [];
  let weeks: number[] = [];
  for (const s of sigs) {
    commits += s.commits;
    additions += s.additions;
    deletions += s.deletions;
    if (!last || s.lastCommit.date > last.date) last = s.lastCommit;
    for (const c of s.contributors) {
      const prev = byAuthor.get(c.author);
      byAuthor.set(c.author, {
        author: c.author,
        commits: (prev?.commits ?? 0) + c.commits,
        additions: (prev?.additions ?? 0) + c.additions,
        deletions: (prev?.deletions ?? 0) + c.deletions,
      });
    }
    recentAll.push(...s.recent);
    if (s.weeks.length > weeks.length) {
      weeks = s.weeks.map(() => 0);
    }
  }
  for (const s of sigs) {
    const offset = weeks.length - s.weeks.length;
    s.weeks.forEach((v, i) => {
      weeks[offset + i] = (weeks[offset + i] ?? 0) + v;
    });
  }
  const contributors = [...byAuthor.values()]
    .sort((a, b) => b.commits - a.commits || a.author.localeCompare(b.author))
    .slice(0, 5);
  const seen = new Set<string>();
  const recent = recentAll
    .filter((c) => (seen.has(c.sha) ? false : (seen.add(c.sha), true)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 5);
  return {
    lastCommit: last,
    commits,
    additions,
    deletions,
    contributors,
    recent,
    weeks,
  } as unknown as JsonValue;
}

/** Attach `attrs.git` per node from local git signals (file / rollup). */
function annotateGitAttrs(
  graph: GraphSnapshotDto,
  gitSignals: ReadonlyMap<string, GitFileSignal>,
): GraphSnapshotDto {
  const under = (prefix: string): GitFileSignal[] => {
    const p = prefix.replace(/\/$/, "");
    const out: GitFileSignal[] = [];
    for (const [path, sig] of gitSignals) {
      if (p === "" || p === "." || path === p || path.startsWith(`${p}/`)) {
        out.push(sig);
      }
    }
    return out;
  };

  const nodes = graph.nodes.map((n) => {
    const path =
      typeof n.attrs?.path === "string"
        ? n.attrs.path
        : n.kind === "file"
          ? n.label
          : null;
    const rootDir =
      typeof n.attrs?.rootDir === "string" ? n.attrs.rootDir : null;
    const scopePrefix =
      typeof n.attrs?.scopePrefix === "string" ? n.attrs.scopePrefix : null;

    let git: JsonValue | null = null;
    if (path && gitSignals.has(path)) {
      git = gitAttrForFile(gitSignals.get(path)!);
    } else if (
      Array.isArray(n.attrs?.memberFiles) &&
      n.attrs.memberFiles.length > 0
    ) {
      const sigs = n.attrs.memberFiles
        .filter((m): m is string => typeof m === "string")
        .map((m) => gitSignals.get(m))
        .filter((s): s is GitFileSignal => s !== undefined);
      git = rollupGit(sigs);
    }

    // Folders / packages / features: roll up every file under the path prefix
    // when a direct file signal or memberFiles rollup was empty.
    if (git === null) {
      const prefix =
        scopePrefix ||
        rootDir ||
        (path &&
        (n.kind === "folder" ||
          n.kind === "package" ||
          n.kind === "feature" ||
          n.kind === "workspace")
          ? path
          : null);
      if (prefix) git = rollupGit(under(prefix));
    }

    if (git === null && n.kind === "workspace") {
      git = rollupGit([...gitSignals.values()]);
    }
    if (git === null) return n;
    return { ...n, attrs: { ...n.attrs, git } };
  });
  return { ...graph, nodes };
}

function buildSearchIndex(
  graph: GraphSnapshotDto,
  clusters: readonly MapCluster[],
  landmarks: readonly Landmark[],
  bookmarks: readonly MapBookmark[],
  zoom: MapZoomLevel,
): MapSearchHit[] {
  const hits: MapSearchHit[] = [];
  for (const n of graph.nodes) {
    hits.push({
      id: `search:node:${n.id}`,
      label: n.label,
      kind: "node",
      zoom,
      ...(typeof n.attrs?.path === "string" ? { path: n.attrs.path } : {}),
    });
  }
  for (const c of clusters) {
    hits.push({
      id: `search:cluster:${c.id}`,
      label: c.label,
      kind: "cluster",
      zoom: c.zoom,
    });
  }
  for (const l of landmarks) {
    hits.push({
      id: `search:landmark:${l.id}`,
      label: l.label,
      kind: "landmark",
      path: l.path,
    });
  }
  for (const b of bookmarks) {
    hits.push({
      id: `search:bookmark:${b.id}`,
      label: b.label,
      kind: "bookmark",
      ...(b.path === undefined ? {} : { path: b.path }),
      ...(b.zoom === undefined ? {} : { zoom: b.zoom }),
    });
  }
  return hits.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Build a RepositoryMap for the requested zoom (deterministic).
 */
export function buildRepositoryMap(
  input: BuildRepositoryMapInput,
): RepositoryMap {
  const zoom = input.zoom ?? "feature";
  const activeLayerIds = resolveActiveLayers(input.layers);
  const hasGit = Boolean(input.gitSignals && input.gitSignals.size > 0);
  const layers = listMapLayerDescriptors().map(
    (l): MapLayerDescriptor =>
      hasGit && (l.id === "activity" || l.id === "ownership")
        ? {
            ...l,
            stub: false,
            description:
              l.id === "activity"
                ? "Recent commit heat (local git history)"
                : "Top author bands (local git blame)",
          }
        : l,
  );
  const bookmarks = [...(input.bookmarks ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  let built: { graph: GraphSnapshotDto; clusters: MapCluster[] };
  switch (zoom) {
    case "repo":
      built = buildRepoZoom(input.packages, input.snapshot.rootPath);
      break;
    case "package":
      built = buildPackageZoom(input.packages, input.dependencyGraph);
      break;
    case "feature":
      built = buildFeatureZoom(input.features);
      break;
    case "file":
      built = buildFileZoom(input.dependencyGraph);
      break;
    case "symbol":
      built = buildSymbolZoom(input.snapshot);
      break;
    default: {
      throw new Error(`Unhandled zoom: ${String(zoom)}`);
    }
  }

  const weighted = annotateWeights(built.graph, input.snapshot);
  const withGit =
    input.gitSignals && input.gitSignals.size > 0
      ? annotateGitAttrs(weighted, input.gitSignals)
      : weighted;
  const signals = computeLayerSignals(
    input.snapshot,
    input.dependencyGraph,
    input.gitSignals,
  );
  const graph = annotateGraphWithLayerSignals(withGit, signals);
  const layoutResult = layoutGraph(graph);
  const searchIndex = buildSearchIndex(
    graph,
    built.clusters,
    input.landmarks,
    bookmarks,
    zoom,
  );

  return {
    rootPath: input.snapshot.rootPath,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    zoom,
    layers,
    activeLayerIds,
    graph,
    ...(layoutResult.ok ? { layout: layoutResult.value } : {}),
    clusters: built.clusters,
    landmarks: [...input.landmarks].sort((a, b) => a.id.localeCompare(b.id)),
    bookmarks,
    searchIndex,
    clusteringNote: clusteringNoteFor(zoom),
    ...(input.gitSummary === undefined ? {} : { git: input.gitSummary }),
  };
}
