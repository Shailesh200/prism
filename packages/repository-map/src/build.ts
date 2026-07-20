import { layoutGraph } from "@prism/graph-engine";
import type {
  FeatureInfo,
  GraphEdgeDto,
  GraphNodeDto,
  GraphSnapshotDto,
  IndexSnapshot,
  Landmark,
  MapBookmark,
  MapCluster,
  MapSearchHit,
  MapZoomLevel,
  RepositoryMap,
} from "@prism/shared";
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
};

function node(
  id: string,
  kind: string,
  label: string,
  attrs?: Record<string, string | number | boolean>,
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

  const nodes = packages.map((pkg) =>
    node(packageId(pkg), "package", pkg.name, {
      rootDir: pkg.rootDir || ".",
    }),
  );
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

function buildFeatureZoom(features: readonly FeatureInfo[]): {
  graph: GraphSnapshotDto;
  clusters: MapCluster[];
} {
  const nodes = features.map((f) =>
    node(`feature:${f.id}`, "feature", f.name, {
      slug: f.slug,
      confidence: f.confidence,
    }),
  );
  const edges: GraphEdgeDto[] = [];
  // Link features that share a directory prefix
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i]!;
      const b = features[j]!;
      const shared = a.memberFiles.some((fa) =>
        b.memberFiles.some(
          (fb) =>
            fa.split("/").slice(0, 2).join("/") ===
            fb.split("/").slice(0, 2).join("/"),
        ),
      );
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
  const layers = listMapLayerDescriptors();
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

  const layoutResult = layoutGraph(built.graph);
  const searchIndex = buildSearchIndex(
    built.graph,
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
    graph: built.graph,
    ...(layoutResult.ok ? { layout: layoutResult.value } : {}),
    clusters: built.clusters,
    landmarks: [...input.landmarks].sort((a, b) => a.id.localeCompare(b.id)),
    bookmarks,
    searchIndex,
    clusteringNote: clusteringNoteFor(zoom),
  };
}
