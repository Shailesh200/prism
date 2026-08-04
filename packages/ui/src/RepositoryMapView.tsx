import {
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Hexagon,
  Share2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type {
  GitRecentFile,
  GraphNodeDto,
  MapBookmark,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
} from "@prism/shared";
import { layoutCardTree, toggleExpanded } from "./card-tree-layout.js";
import { MapLayersPanel } from "./MapLayersPanel.js";
import {
  dominantHeat,
  heatBand,
  parseLayerSignals,
  signalValue,
} from "./map-layers.js";
import {
  cardEntriesAt,
  drillScopeFromMapNode,
  findTreeEntryById,
  folderCardEntries,
  nodesFromMemberFiles,
} from "./file-scope.js";
import type { TreeEntry } from "./file-tree.js";
import { layoutOverviewGraph } from "./overview-layout.js";

type TreeScope = {
  readonly memberFiles?: readonly string[];
  /** Show this folder's children as the tree roots (packages). */
  readonly folderPath?: string;
};
import { CommandPalette } from "./CommandPalette.js";
import { MapAtmosphere } from "./MapAtmosphere.js";
import { MapControls } from "./MapControls.js";
import { MapNode } from "./MapNode.js";
import { MaterialFileIcon } from "./MaterialFileIcon.js";
import {
  FEATURE_LENS_BASE_ZOOM,
  FEATURE_LENS_ZOOM,
  filterSearchHits,
  UI_ZOOM_LEVELS,
} from "./map-model.js";
import { isPathKind } from "./map-path.js";
import { resolveFileType } from "./file-type.js";
import "@xyflow/react/dist/style.css";

export type RepositoryMapViewProps = {
  readonly map: RepositoryMap;
  readonly bookmarks?: readonly MapBookmark[];
  readonly brandMarkSrc?: string;
  /** Hide the top-bar brand mark (e.g. when an app nav rail already brands). */
  readonly showBrand?: boolean;
  /** Recent local git file changes for the sidebar (newest first). */
  readonly recentChanges?: readonly GitRecentFile[];
  /** Current git branch shown in the breadcrumb (falls back to the map's git summary). */
  readonly branch?: string | undefined;
  readonly onZoomChange?: (zoom: MapZoomLevel) => void;
  readonly onLayersChange?: (layers: readonly MapLayerId[]) => void;
  readonly onAddBookmark?: (label: string, nodeId: string) => void;
  readonly onSelectNode?: (nodeId: string | null) => void;
  /** Open a repo-relative file path in the host editor (IDE). */
  readonly onOpenPath?: (path: string) => void;
  /**
   * Deep-link focus (M-048 Phase 3 "Reveal on map"): selects this node id when
   * it changes. Takes priority over {@link focusPath}.
   */
  readonly focusNodeId?: string | null;
  /** Deep-link focus by repo-relative path — resolved to a graph node id. */
  readonly focusPath?: string | null;
};

const nodeTypes = { prism: MapNode };

const defaultEdgeOptions = {
  type: "default" as const,
  className: "prism-edge",
  style: {
    stroke: "url(#prism-edge-gradient)",
    strokeWidth: 1.6,
  },
};

const ZOOM_LABELS: Record<MapZoomLevel, string> = {
  repo: "Repo",
  package: "Package",
  feature: "Feature",
  file: "File",
  symbol: "Symbol",
};

/** Structural breadcrumb order (Feature is a lens, not an altitude). */
const STRUCTURAL_ORDER: readonly MapZoomLevel[] = [
  "repo",
  "package",
  "file",
  "symbol",
];

/** UXPilot feature-region palette (dot colors for the left sidebar / legend). */
const REGION_COLORS = [
  "#00C2C2",
  "#6C63FF",
  "#F59E0B",
  "#F43F5E",
  "#10B981",
  "#A78BFA",
] as const;

type RegionItem = {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly color: string;
};

/** Derive coarse feature/package regions for the left sidebar + legend. */
function regionsFromMap(map: RepositoryMap): RegionItem[] {
  const groups = map.graph.nodes.filter(
    (n) => n.kind === "feature" || n.kind === "package" || n.kind === "folder",
  );
  return groups.slice(0, 12).map((n, i) => {
    const members = (n.attrs as Record<string, unknown> | undefined)
      ?.memberFiles;
    return {
      id: n.id,
      label: n.label,
      count: Array.isArray(members) ? members.length : 0,
      color: REGION_COLORS[i % REGION_COLORS.length] as string,
    };
  });
}

function pct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

type MetricTone = "emerald" | "amber" | "violet" | "rose" | "brand";

type MetricRow = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** `null` when the repository has no data for this metric (ADR-0029). */
  readonly fill: number | null;
  readonly tone: MetricTone;
};

/** Compact relative time like "3h ago" / "2d ago" from an ISO date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** Initials for an avatar bubble. */
function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s/._-]+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}

type OwnerInfo = {
  readonly author: string;
  readonly commits: number;
  readonly share: number;
  readonly note: string;
  /** Top contributors to show in the inspector (already capped). */
  readonly top: readonly GitContributorLike[];
  /** Contributors beyond {@link top} (for "+N more"). */
  readonly moreCount: number;
};

type GitContributorLike = {
  readonly author: string;
  readonly commits: number;
};

/** Hard cap so a busy monorepo folder never floods the inspector. */
const OWNER_LIST_CAP = 5;

/** Read `attrs.git.contributors` (attached by repository-map when git is indexed). */
function contributorsFromAttrs(
  attrs: Record<string, unknown> | undefined,
): GitContributorLike[] {
  const git = attrs?.git;
  if (!git || typeof git !== "object" || Array.isArray(git)) return [];
  const raw = (git as { contributors?: unknown }).contributors;
  if (!Array.isArray(raw)) return [];
  const out: GitContributorLike[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const author = (row as { author?: unknown }).author;
    const commits = (row as { commits?: unknown }).commits;
    if (typeof author !== "string" || !author.trim()) continue;
    out.push({
      author: author.trim(),
      commits: typeof commits === "number" && commits >= 0 ? commits : 0,
    });
  }
  return out;
}

function mergeContributors(
  into: Map<string, number>,
  rows: readonly GitContributorLike[],
): void {
  for (const c of rows) {
    into.set(c.author, (into.get(c.author) ?? 0) + c.commits);
  }
}

/** Roll up contributors from file nodes under a folder/package path prefix. */
function contributorsUnderPrefix(
  map: RepositoryMap,
  prefix: string,
): GitContributorLike[] {
  const p = prefix.replace(/\/$/, "");
  if (!p) return [];
  const byAuthor = new Map<string, number>();
  for (const n of map.graph.nodes) {
    if (n.kind !== "file") continue;
    const fp =
      typeof n.attrs?.path === "string"
        ? n.attrs.path
        : n.id.startsWith("file:")
          ? n.id.slice("file:".length)
          : n.label;
    if (fp !== p && !fp.startsWith(`${p}/`)) continue;
    mergeContributors(
      byAuthor,
      contributorsFromAttrs(n.attrs as Record<string, unknown> | undefined),
    );
  }
  return [...byAuthor.entries()]
    .map(([author, commits]) => ({ author, commits }))
    .sort((a, b) => b.commits - a.commits || a.author.localeCompare(b.author));
}

function ownershipFromContributors(
  contributors: readonly GitContributorLike[],
  areaLabel: "file" | "area",
): OwnerInfo | null {
  if (contributors.length === 0) return null;
  const total = contributors.reduce((n, c) => n + c.commits, 0) || 1;
  const sorted = [...contributors].sort(
    (a, b) => b.commits - a.commits || a.author.localeCompare(b.author),
  );
  const top = sorted.slice(0, OWNER_LIST_CAP);
  const primary = top[0]!;
  const share = primary.commits / total;
  const moreCount = Math.max(0, sorted.length - top.length);
  const others = sorted.length - 1;
  return {
    author: primary.author,
    commits: primary.commits,
    share,
    top,
    moreCount,
    note:
      areaLabel === "area"
        ? others > 0
          ? `Top author across this folder · ${others} other contributor${others === 1 ? "" : "s"}`
          : `${primary.commits} commit${primary.commits === 1 ? "" : "s"} in this folder`
        : others > 0
          ? `${Math.round(share * 100)}% of commits · ${others} other contributor${others === 1 ? "" : "s"}`
          : `${primary.commits} commit${primary.commits === 1 ? "" : "s"} in scanned window`,
  };
}

/**
 * Primary owner for the inspector: prefer node `attrs.git`, then a graph node
 * with the same path, then folder-prefix rollup, then Recent Changes.
 */
function resolveOwnership(
  map: RepositoryMap,
  selected: GraphNodeDto,
  recentChanges: readonly GitRecentFile[] | undefined,
): OwnerInfo | null {
  let contributors = contributorsFromAttrs(
    selected.attrs as Record<string, unknown> | undefined,
  );

  const path =
    typeof selected.attrs?.path === "string"
      ? selected.attrs.path
      : typeof selected.attrs?.rootDir === "string"
        ? selected.attrs.rootDir
        : typeof selected.attrs?.scopePrefix === "string"
          ? selected.attrs.scopePrefix
          : selected.kind === "file"
            ? selected.label
            : null;

  const isArea =
    selected.kind === "folder" ||
    selected.kind === "package" ||
    selected.kind === "feature" ||
    selected.kind === "workspace" ||
    selected.kind === "repo";

  if (contributors.length === 0 && path) {
    const match = map.graph.nodes.find(
      (n) =>
        n.id === selected.id ||
        n.id === `file:${path}` ||
        n.id === `folder:${path}` ||
        (typeof n.attrs?.path === "string" && n.attrs.path === path),
    );
    if (match) {
      contributors = contributorsFromAttrs(
        match.attrs as Record<string, unknown> | undefined,
      );
    }
  }

  if (contributors.length === 0 && path && isArea) {
    contributors = contributorsUnderPrefix(map, path);
  }

  if (contributors.length === 0 && path && recentChanges) {
    if (isArea) {
      const byAuthor = new Map<string, number>();
      const p = path.replace(/\/$/, "");
      for (const f of recentChanges) {
        if (f.path !== p && !f.path.startsWith(`${p}/`)) continue;
        const author = f.lastCommit.author?.trim();
        if (!author) continue;
        byAuthor.set(
          author,
          (byAuthor.get(author) ?? 0) + Math.max(1, f.commits),
        );
      }
      contributors = [...byAuthor.entries()]
        .map(([author, commits]) => ({ author, commits }))
        .sort(
          (a, b) => b.commits - a.commits || a.author.localeCompare(b.author),
        );
    } else {
      const recent = recentChanges.find((f) => f.path === path);
      if (recent?.lastCommit.author) {
        return {
          author: recent.lastCommit.author,
          commits: recent.commits,
          share: 1,
          top: [{ author: recent.lastCommit.author, commits: recent.commits }],
          moreCount: 0,
          note: "Last author on this file (recent activity)",
        };
      }
    }
  }

  return ownershipFromContributors(contributors, isArea ? "area" : "file");
}

function Lenses(props: {
  featureActive: boolean;
  onToggleFeature: () => void;
}): ReactElement {
  return (
    <div className="prism-lenses">
      <p className="prism-map__sheet-kicker">Lenses</p>
      <button
        type="button"
        className="prism-lens"
        data-active={props.featureActive ? "true" : "false"}
        aria-pressed={props.featureActive}
        onClick={props.onToggleFeature}
      >
        <Hexagon size={13} strokeWidth={2} aria-hidden />
        <span>Feature</span>
        <em>{props.featureActive ? "on" : "off"}</em>
      </button>
    </div>
  );
}

function nodeMeta(
  kind: string,
  attrs: Record<string, unknown> | undefined,
): string | undefined {
  if (kind === "workspace" || kind === "repo") {
    return "Workspace · double-click for packages";
  }
  if (kind === "feature") {
    const members = attrs?.memberFiles;
    const count = Array.isArray(members) ? members.length : undefined;
    if (typeof count === "number") {
      return `${count} ${count === 1 ? "file" : "files"}`;
    }
  }
  if (kind === "package" || kind === "feature") {
    return "Double-click to open files";
  }
  return undefined;
}

function isFileZoom(zoom: MapZoomLevel): boolean {
  return zoom === "file" || zoom === "symbol";
}

function treeRootsForMap(
  map: RepositoryMap,
  scope: TreeScope | null,
): TreeEntry[] {
  const nodes =
    scope?.memberFiles && scope.memberFiles.length > 0
      ? nodesFromMemberFiles(scope.memberFiles)
      : map.graph.nodes;
  if (scope?.folderPath) {
    return cardEntriesAt(nodes, scope.folderPath);
  }
  return folderCardEntries(nodes);
}

function findEntryInRoots(
  roots: readonly TreeEntry[],
  id: string,
): TreeEntry | undefined {
  const walk = (entry: TreeEntry): TreeEntry | undefined => {
    if (entry.id === id) return entry;
    for (const child of entry.children) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const root of roots) {
    const hit = walk(root);
    if (hit) return hit;
  }
  return undefined;
}

/** Overview graph at coarse zoom; expandable file tree at file/symbol zoom. */
function toFlow(
  map: RepositoryMap,
  selectedId: string | null,
  expanded: ReadonlySet<string>,
  scope: TreeScope | null,
): { nodes: Node[]; edges: Edge[] } {
  if (isFileZoom(map.zoom)) {
    const roots = treeRootsForMap(map, scope);
    return layoutCardTree(roots, expanded, selectedId);
  }

  return layoutOverviewGraph(
    map.graph.nodes,
    map.graph.edges,
    selectedId,
    nodeMeta,
  );
}

function MapCanvas(props: {
  map: RepositoryMap;
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  scope: TreeScope | null;
  activeLayerIds: readonly MapLayerId[];
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  dimLayers: boolean;
}): ReactElement {
  const { fitView } = useReactFlow();
  const onToggleRef = useRef(props.onToggle);
  onToggleRef.current = props.onToggle;
  const expandKey = [...props.expanded].sort().join(",");
  const scopeKey = `${props.scope?.folderPath ?? ""}|${props.scope?.memberFiles?.join(",") ?? ""}`;
  const layersKey = props.activeLayerIds.join(",");
  const initial = useMemo(
    () => toFlow(props.map, props.selectedId, props.expanded, props.scope),
    [props.map, props.selectedId, props.expanded, props.scope],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    const next = toFlow(
      props.map,
      props.selectedId,
      props.expanded,
      props.scope,
    );
    const showDeps = props.activeLayerIds.includes("dependency");
    const byId = new Map(props.map.graph.nodes.map((n) => [n.id, n]));
    setNodes(
      next.nodes.map((node) => {
        const graphNode = byId.get(node.id);
        const heat = dominantHeat(
          parseLayerSignals(graphNode?.attrs as Record<string, unknown>),
          props.activeLayerIds,
        );
        return {
          ...node,
          data: {
            ...node.data,
            onToggle: () => onToggleRef.current(node.id),
            ...(heat
              ? { heatLayer: heat.layer, heatBand: heatBand(heat.value) }
              : { heatLayer: undefined, heatBand: undefined }),
          },
        };
      }),
    );
    setEdges(showDeps ? next.edges : []);
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.28, duration: 380 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [
    props.map,
    props.selectedId,
    expandKey,
    scopeKey,
    layersKey,
    fitView,
    setNodes,
    setEdges,
    props.expanded,
    props.scope,
    props.activeLayerIds,
  ]);

  return (
    <div
      className="prism-map__fade"
      data-dim={props.dimLayers ? "true" : "false"}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => props.onSelect(node.id)}
        onNodeDoubleClick={(_, node) => props.onToggle(node.id)}
        onPaneClick={() => props.onSelect(null)}
        fitView
        minZoom={0.12}
        maxZoom={1.75}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <MapAtmosphere />
        <MiniMap
          className="prism-minimap"
          position="top-right"
          pannable
          zoomable
          ariaLabel="Map overview"
          maskColor="color-mix(in srgb, var(--prism-canvas) 62%, transparent)"
          nodeColor={(n) =>
            (n.data as { group?: boolean })?.group
              ? "color-mix(in srgb, var(--prism-brand) 12%, transparent)"
              : "color-mix(in srgb, var(--prism-brand) 55%, #ffffff)"
          }
          nodeStrokeColor="var(--prism-edge)"
          nodeBorderRadius={6}
        />
        <MapControls />
      </ReactFlow>
    </div>
  );
}

function SearchIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.4 10.4 13.2 13.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function resolveCardNode(
  map: RepositoryMap,
  id: string,
  scope: TreeScope | null,
): GraphNodeDto | undefined {
  const fromGraph = map.graph.nodes.find((n) => n.id === id);
  if (fromGraph) return fromGraph;

  const graphNodes =
    scope?.memberFiles && scope.memberFiles.length > 0
      ? nodesFromMemberFiles(scope.memberFiles)
      : map.graph.nodes;
  const entry =
    findTreeEntryById(graphNodes, id) ??
    (scope?.folderPath
      ? findEntryInRoots(cardEntriesAt(graphNodes, scope.folderPath), id)
      : undefined);
  if (!entry) return undefined;

  const path = entry.path;
  const fromPath = path
    ? map.graph.nodes.find(
        (n) =>
          n.id === `file:${path}` ||
          (typeof n.attrs?.path === "string" && n.attrs.path === path),
      )
    : undefined;
  const git = fromPath?.attrs?.git;

  return {
    id: entry.nodeId ?? entry.id,
    kind: entry.kind,
    label: entry.kind === "symbol" ? entry.name : entry.path || entry.name,
    attrs: {
      path: entry.path,
      ...(git !== undefined ? { git } : {}),
    },
  };
}

export function RepositoryMapView(props: RepositoryMapViewProps): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dim, setDim] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [treeScope, setTreeScope] = useState<TreeScope | null>(null);
  const [pendingScope, setPendingScope] = useState<TreeScope | null>(null);
  const [activeLayerIds, setActiveLayerIds] = useState<MapLayerId[]>(() => [
    ...props.map.activeLayerIds,
  ]);

  useEffect(() => {
    setActiveLayerIds([...props.map.activeLayerIds]);
  }, [props.map.activeLayerIds.join(",")]);

  useEffect(() => {
    if (props.focusNodeId) {
      setSelectedId(props.focusNodeId);
      return;
    }
    if (!props.focusPath) return;
    const target = props.map.graph.nodes.find(
      (n) =>
        n.id === `file:${props.focusPath}` ||
        (typeof n.attrs?.path === "string" && n.attrs.path === props.focusPath),
    );
    if (target) setSelectedId(target.id);
  }, [props.focusNodeId, props.focusPath, props.map.graph.nodes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const bookmarks = props.bookmarks ?? props.map.bookmarks;
  const hits = filterSearchHits(props.map.searchIndex, query);
  const selected = selectedId
    ? resolveCardNode(props.map, selectedId, treeScope)
    : undefined;
  const markSrc = props.brandMarkSrc ?? "/brand/prism-mark.png";
  const selectedIsPath = selected ? isPathKind(selected.kind) : false;
  const selectedType =
    selectedIsPath && selected ? resolveFileType(selected.label) : null;

  const selectedStats = useMemo(() => {
    if (!selectedId || !selected) return null;
    const confidence =
      typeof selected.attrs?.confidence === "number"
        ? selected.attrs.confidence
        : null;
    const members = selected.attrs?.memberFiles;
    const fileCount = Array.isArray(members) ? members.length : null;
    const neighborIds = new Set<string>();
    for (const e of props.map.graph.edges) {
      if (e.from === selectedId) neighborIds.add(e.to);
      else if (e.to === selectedId) neighborIds.add(e.from);
    }
    const neighborNodes = [...neighborIds]
      .map((id) => props.map.graph.nodes.find((n) => n.id === id))
      .filter((n): n is GraphNodeDto => Boolean(n))
      .slice(0, 8);
    return {
      confidence,
      fileCount,
      links: neighborIds.size,
      neighborNodes,
    };
  }, [selectedId, selected, props.map.graph]);

  const ownership = useMemo(() => {
    if (!selected) return null;
    return resolveOwnership(props.map, selected, props.recentChanges);
  }, [selected, props.map, props.recentChanges]);

  const regions = useMemo(() => regionsFromMap(props.map), [props.map]);

  const regionCount = useMemo(
    () =>
      props.map.graph.nodes.filter(
        (n) => n.kind === "feature" || n.kind === "package",
      ).length,
    [props.map.graph.nodes],
  );

  /** Best-effort inspector metrics from real signals; falls back to graph. */
  const metrics = useMemo<MetricRow[]>(() => {
    if (!selected) return [];
    const signals = parseLayerSignals(
      selected.attrs as Record<string, unknown> | undefined,
    );
    const rows: MetricRow[] = [];
    if (selectedStats?.confidence !== null && selectedStats) {
      rows.push({
        key: "confidence",
        label: "Confidence",
        value: `${pct(selectedStats.confidence ?? 0)}`,
        fill: pct(selectedStats.confidence ?? 0),
        tone: "emerald",
      });
    }
    const links = selectedStats?.links ?? 0;
    rows.push({
      key: "coupling",
      label: "Coupling",
      value: links >= 8 ? "High" : links >= 3 ? "Medium" : "Low",
      fill: Math.min(100, links * 12),
      tone: links >= 8 ? "amber" : links >= 3 ? "violet" : "emerald",
    });
    if (signals) {
      // A layer with no data reads as "No data" rather than 0%, which would be
      // indistinguishable from a measured zero (ADR-0029).
      const coverage = signalValue(signals, "coverage");
      rows.push({
        key: "coverage",
        label: "Test coverage",
        value: coverage === null ? "No data" : `${pct(coverage)}%`,
        fill: coverage === null ? null : pct(coverage),
        tone: "violet",
      });
      const activity = signalValue(signals, "activity");
      rows.push({
        key: "churn",
        label: "Churn (activity)",
        value: activity === null ? "No data" : `${pct(activity)}%`,
        fill: activity === null ? null : pct(activity),
        tone: "rose",
      });
    }
    return rows;
  }, [selected, selectedStats]);

  const visibleCount = useMemo(() => {
    if (!isFileZoom(props.map.zoom)) return props.map.graph.nodes.length;
    return layoutCardTree(
      treeRootsForMap(props.map, treeScope),
      expanded,
      selectedId,
    ).nodes.length;
  }, [props.map, treeScope, expanded, selectedId]);

  useEffect(() => {
    setDim(true);
    const t = window.setTimeout(() => setDim(false), 200);
    return () => window.clearTimeout(t);
  }, [props.map.zoom, activeLayerIds.join(",")]);

  const onLayersChange = (next: readonly MapLayerId[]) => {
    setActiveLayerIds([...next]);
    props.onLayersChange?.(next);
  };

  useEffect(() => {
    setExpanded(new Set());
    setSelectedId(null);
    if (!isFileZoom(props.map.zoom)) {
      setTreeScope(null);
    }
  }, [props.map.zoom]);

  useEffect(() => {
    if (pendingScope === null) return;
    if (isFileZoom(props.map.zoom)) {
      const empty =
        !pendingScope.memberFiles?.length && !pendingScope.folderPath;
      setTreeScope(empty ? null : pendingScope);
      setPendingScope(null);
    }
  }, [props.map.zoom, pendingScope]);

  const onToggle = (id: string) => {
    if (id.startsWith("group:")) return;

    // Coarse zoom: drill by level, or open file tree for package/feature
    if (!isFileZoom(props.map.zoom)) {
      const node = props.map.graph.nodes.find((n) => n.id === id);
      if (!node) return;

      if (node.kind === "workspace" || node.kind === "repo") {
        props.onZoomChange?.("package");
        return;
      }

      if (props.map.zoom === "package" && node.kind === "package") {
        const scope = drillScopeFromMapNode(node);
        if (scope?.pathPrefix) {
          setPendingScope({ folderPath: scope.pathPrefix });
        } else {
          setPendingScope({});
        }
        props.onZoomChange?.("file");
        return;
      }

      const scope = drillScopeFromMapNode(node);
      if (!scope) {
        if (node.kind === "package") props.onZoomChange?.("feature");
        return;
      }
      if (scope.memberFiles && scope.memberFiles.length > 0) {
        setPendingScope({ memberFiles: scope.memberFiles });
      } else if (scope.pathPrefix) {
        setPendingScope({ folderPath: scope.pathPrefix });
      } else {
        setPendingScope({});
      }
      props.onZoomChange?.("file");
      return;
    }

    const roots = treeRootsForMap(props.map, treeScope);
    const entry = findEntryInRoots(roots, id);
    if (!entry || entry.children.length === 0) {
      const nodeId =
        entry?.nodeId ?? resolveCardNode(props.map, id, treeScope)?.id ?? id;
      setSelectedId(nodeId);
      props.onSelectNode?.(nodeId);
      return;
    }

    setExpanded((prev) => toggleExpanded(prev, entry));
  };

  const featureLens = props.map.zoom === FEATURE_LENS_ZOOM;
  const structuralZoom = featureLens ? FEATURE_LENS_BASE_ZOOM : props.map.zoom;
  const repoName =
    props.map.rootPath.split("/").filter(Boolean).pop() ?? "Repository";
  const branchName = props.branch ?? props.map.git?.branch ?? "main";
  const crumbLevels = STRUCTURAL_ORDER.slice(
    0,
    STRUCTURAL_ORDER.indexOf(structuralZoom) + 1,
  );
  const toggleFeatureLens = () => {
    props.onZoomChange?.(
      featureLens ? FEATURE_LENS_BASE_ZOOM : FEATURE_LENS_ZOOM,
    );
  };

  return (
    <div className="prism-map prism-theme">
      <header className="prism-map__top">
        <div className="prism-map__brand-lead">
          {props.showBrand === false ? null : (
            <div className="prism-map__brand">
              <img src={markSrc} alt="" width={22} height={22} />
              <span>Prism</span>
            </div>
          )}
          <nav className="prism-map__crumb" aria-label="Repository">
            <span className="prism-map__crumb-cur">{repoName}</span>
            <span className="prism-map__branch">{branchName}</span>
          </nav>
        </div>

        <label className="prism-map__search">
          <SearchIcon />
          <input
            value={query}
            placeholder="Find a feature or file…"
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setSearchOpen(false), 120);
            }}
          />
          <button
            type="button"
            className="prism-map__kbd"
            aria-label="Open command menu"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPaletteOpen(true)}
          >
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </button>
          <ul data-open={searchOpen && hits.length > 0 ? "true" : "false"}>
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (hit.kind === "node") {
                      const nodeId = hit.id.replace(/^search:node:/, "");
                      setSelectedId(nodeId);
                      props.onSelectNode?.(nodeId);
                    }
                    setQuery(hit.label);
                    setSearchOpen(false);
                  }}
                >
                  <span>{hit.label}</span>
                  <em>{hit.kind}</em>
                </button>
              </li>
            ))}
          </ul>
        </label>

        <div className="prism-map__top-right">
          <span className="prism-map__sync">
            <span className="prism-map__sync-dot" aria-hidden />
            {visibleCount} on map
          </span>
          <button type="button" className="prism-map__action">
            <Share2 size={13} strokeWidth={2} aria-hidden />
            Share
          </button>
          <button
            type="button"
            className="prism-map__action prism-map__action--primary"
          >
            <Zap size={13} strokeWidth={2} aria-hidden />
            Blast Radius
          </button>
          <span className="prism-map__avatar" aria-hidden>
            PR
          </span>
        </div>
      </header>

      <aside className="prism-map__sidebar" aria-label="Repository sidebar">
        <div className="prism-side">
          <p className="prism-side__title">Repository</p>
          <div className="prism-side__stats">
            <div className="prism-side__stat">
              <span className="prism-side__stat-k">Nodes</span>
              <span className="prism-side__stat-v">
                {props.map.graph.nodes.length.toLocaleString()}
              </span>
            </div>
            <div className="prism-side__stat">
              <span className="prism-side__stat-k">Edges</span>
              <span className="prism-side__stat-v">
                {props.map.graph.edges.length.toLocaleString()}
              </span>
            </div>
            <div className="prism-side__stat">
              <span className="prism-side__stat-k">Regions</span>
              <span className="prism-side__stat-v">{regionCount}</span>
            </div>
            <div className="prism-side__stat">
              <span className="prism-side__stat-k">On map</span>
              <span className="prism-side__stat-v" data-tone="good">
                {visibleCount}
              </span>
            </div>
          </div>
        </div>

        {regions.length > 0 ? (
          <div className="prism-side">
            <p className="prism-side__title">Feature Regions</p>
            <div className="prism-side__regions">
              {regions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  className="prism-side__region"
                  data-active={selectedId === region.id ? "true" : "false"}
                  onClick={() => {
                    setSelectedId(region.id);
                    props.onSelectNode?.(region.id);
                  }}
                >
                  <span className="prism-side__region-label">
                    <span
                      className="prism-side__dot"
                      style={{ background: region.color }}
                    />
                    <span className="prism-side__region-name">
                      {region.label}
                    </span>
                  </span>
                  {region.count > 0 ? (
                    <span className="prism-side__region-count">
                      {region.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="prism-side">
          <MapLayersPanel
            layers={props.map.layers}
            activeLayerIds={activeLayerIds}
            onChange={onLayersChange}
          />
        </div>

        <div className="prism-side">
          <p className="prism-side__title">Recent Changes</p>
          {props.recentChanges && props.recentChanges.length > 0 ? (
            <div className="prism-side__recent">
              {props.recentChanges.slice(0, 6).map((change) => (
                <button
                  key={change.path}
                  type="button"
                  className="prism-side__recent-item"
                  title={change.path}
                  onClick={() => {
                    setQuery(change.path);
                    setSearchOpen(false);
                  }}
                >
                  <span className="prism-side__recent-file">
                    {change.path.split("/").pop() ?? change.path}
                  </span>
                  <span className="prism-side__recent-meta">
                    {change.lastCommit.author} ·{" "}
                    {relativeTime(change.lastCommit.date)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="prism-side__empty">
              Local Git history appears here once indexed.
            </p>
          )}
        </div>
      </aside>

      <main className="prism-map__stage">
        <nav className="prism-crumbs" aria-label="Location">
          {crumbLevels.map((level, i) => {
            const isActive = !featureLens && level === structuralZoom;
            const label = level === "repo" ? repoName : ZOOM_LABELS[level];
            return (
              <span key={level} className="prism-crumbs__wrap">
                {i > 0 ? (
                  <ChevronRight
                    className="prism-crumbs__sep"
                    size={13}
                    aria-hidden
                  />
                ) : null}
                <button
                  type="button"
                  className="prism-crumbs__seg"
                  data-active={isActive ? "true" : undefined}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => props.onZoomChange?.(level)}
                >
                  {label}
                </button>
              </span>
            );
          })}
          {featureLens ? (
            <span className="prism-crumbs__wrap">
              <ChevronRight
                className="prism-crumbs__sep"
                size={13}
                aria-hidden
              />
              <button
                type="button"
                className="prism-crumbs__seg prism-crumbs__seg--lens"
                data-active="true"
                aria-current="page"
                onClick={toggleFeatureLens}
                title="Feature lens — click to exit"
              >
                <Hexagon size={11} strokeWidth={2.2} aria-hidden />
                Feature lens
              </button>
            </span>
          ) : null}
          {treeScope?.folderPath ? (
            <span className="prism-crumbs__wrap">
              <ChevronRight
                className="prism-crumbs__sep"
                size={13}
                aria-hidden
              />
              <span className="prism-crumbs__seg prism-crumbs__seg--path">
                {treeScope.folderPath}
              </span>
            </span>
          ) : null}
        </nav>

        <ReactFlowProvider>
          <MapCanvas
            map={props.map}
            selectedId={selectedId}
            expanded={expanded}
            scope={treeScope}
            activeLayerIds={activeLayerIds}
            dimLayers={dim}
            onSelect={(id) => {
              if (id?.startsWith("group:")) return;
              setSelectedId(id);
              props.onSelectNode?.(id);
            }}
            onToggle={onToggle}
          />
        </ReactFlowProvider>

        <div className="prism-map__legend" aria-hidden>
          {isFileZoom(props.map.zoom)
            ? "Double-click a folder to expand · click a file to inspect"
            : "Double-click a module to open its files · use the breadcrumb to go back"}
        </div>
      </main>

      <aside
        className="prism-map__sheet"
        data-empty={!selected ? "true" : "false"}
      >
        {!selected ? (
          <>
            <p className="prism-map__sheet-kicker">Inspector</p>
            <h2 className="prism-map__sheet-title">Nothing selected</h2>
            <p className="prism-map__sheet-copy">
              {isFileZoom(props.map.zoom)
                ? "Click a file to inspect it. Double-click a folder to expand its children."
                : "Select a module on the map or in the sidebar to see its identity, metrics, and dependencies."}
            </p>
            <div className="prism-map__sheet-divider" />
            <Lenses
              featureActive={featureLens}
              onToggleFeature={toggleFeatureLens}
            />
          </>
        ) : (
          <>
            <div className="prism-insp__identity">
              <span className="prism-insp__icon">
                {selected.kind === "folder" ? (
                  <MaterialFileIcon
                    name={
                      typeof selected.attrs?.path === "string"
                        ? selected.attrs.path
                        : selected.label
                    }
                    folder
                    size={22}
                  />
                ) : selectedIsPath ? (
                  <MaterialFileIcon
                    name={
                      typeof selected.attrs?.path === "string"
                        ? selected.attrs.path
                        : selected.label
                    }
                    size={22}
                  />
                ) : (
                  <Hexagon size={18} strokeWidth={2} aria-hidden />
                )}
              </span>
              <div style={{ minWidth: 0 }}>
                <h2
                  className="prism-map__sheet-title"
                  data-mono={selectedIsPath ? "true" : "false"}
                  style={{ fontSize: "0.95rem" }}
                >
                  {selectedIsPath
                    ? (selected.label.split("/").pop() ?? selected.label)
                    : selected.label}
                </h2>
                <p className="prism-dep__path" style={{ marginTop: 2 }}>
                  {typeof selected.attrs?.path === "string"
                    ? selected.attrs.path
                    : selected.label}
                </p>
              </div>
            </div>

            <div className="prism-insp__tags">
              <span className="prism-pill">
                <span className="prism-pill__dot" />
                {selected.kind}
              </span>
              {selectedType ? (
                <span className="prism-tag">{selectedType.label}</span>
              ) : null}
              {selectedStats?.fileCount !== null &&
              selectedStats?.fileCount !== undefined ? (
                <span className="prism-tag">
                  {selectedStats.fileCount} files
                </span>
              ) : null}
            </div>

            {metrics.length > 0 ? (
              <>
                <div className="prism-map__sheet-divider" />
                <p className="prism-map__sheet-kicker">Metrics</p>
                <div className="prism-metrics">
                  {metrics.map((m) => (
                    <div key={m.key} data-no-data={m.fill === null}>
                      <div className="prism-metric__row">
                        <span className="prism-metric__k">{m.label}</span>
                        <span
                          className="prism-metric__v"
                          data-tone={m.tone}
                          data-no-data={m.fill === null}
                        >
                          {m.value}
                        </span>
                      </div>
                      <div
                        className="prism-metric__bar"
                        data-no-data={m.fill === null}
                      >
                        {m.fill === null ? null : (
                          <span
                            className="prism-metric__fill"
                            data-tone={m.tone}
                            style={{ width: `${m.fill}%` }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <div className="prism-map__sheet-divider" />
            <div className="prism-blast">
              <div className="prism-blast__row">
                <p className="prism-map__sheet-kicker" style={{ margin: 0 }}>
                  Blast Radius
                </p>
                <span className="prism-badge">
                  {selectedStats && selectedStats.links >= 8
                    ? "High"
                    : selectedStats && selectedStats.links >= 3
                      ? "Medium"
                      : "Low"}
                </span>
              </div>
              <div className="prism-blast__row">
                <span className="prism-blast__k">Direct links</span>
                <span className="prism-blast__v">
                  {selectedStats?.links ?? 0}
                </span>
              </div>
              {selectedStats?.fileCount !== null &&
              selectedStats?.fileCount !== undefined ? (
                <div className="prism-blast__row">
                  <span className="prism-blast__k">Member files</span>
                  <span className="prism-blast__v">
                    {selectedStats.fileCount}
                  </span>
                </div>
              ) : null}
            </div>

            {selectedStats && selectedStats.neighborNodes.length > 0 ? (
              <>
                <div className="prism-map__sheet-divider" />
                <p className="prism-map__sheet-kicker">Dependencies</p>
                <div className="prism-deps">
                  {selectedStats.neighborNodes.map((n, i) => {
                    const inbound = i % 2 === 0;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className="prism-dep"
                        title={n.label}
                        onClick={() => {
                          setSelectedId(n.id);
                          props.onSelectNode?.(n.id);
                        }}
                      >
                        <span className="prism-dep__label">
                          {inbound ? (
                            <ArrowLeft
                              size={11}
                              className="prism-dep__dir"
                              data-dir="in"
                              aria-hidden
                            />
                          ) : (
                            <ArrowRight
                              size={11}
                              className="prism-dep__dir"
                              data-dir="out"
                              aria-hidden
                            />
                          )}
                          <span className="prism-dep__path">{n.label}</span>
                        </span>
                        <span
                          className="prism-dep__dir"
                          data-dir={inbound ? "in" : "out"}
                        >
                          {inbound ? "used by" : "import"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <div className="prism-map__sheet-divider" />
            <p className="prism-map__sheet-kicker">Ownership</p>
            {ownership ? (
              <div className="prism-owner-block">
                <div className="prism-owner">
                  <span className="prism-owner__avatar">
                    {initials(ownership.author)}
                  </span>
                  <div>
                    <div className="prism-owner__name">{ownership.author}</div>
                    <div className="prism-owner__role">{ownership.note}</div>
                  </div>
                </div>
                {ownership.top.length > 1 || ownership.moreCount > 0 ? (
                  <ul className="prism-owner-list">
                    {ownership.top.map((c) => (
                      <li key={c.author} className="prism-owner-list__row">
                        <span className="prism-owner-list__avatar" aria-hidden>
                          {initials(c.author)}
                        </span>
                        <span
                          className="prism-owner-list__name"
                          title={c.author}
                        >
                          {c.author}
                        </span>
                        <span className="prism-owner-list__meta">
                          {c.commits}
                        </span>
                      </li>
                    ))}
                    {ownership.moreCount > 0 ? (
                      <li className="prism-owner-list__more">
                        +{ownership.moreCount} more
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="prism-owner">
                <span className="prism-owner__avatar">
                  {initials(selected.label)}
                </span>
                <div>
                  <div className="prism-owner__name">Unassigned</div>
                  <div className="prism-owner__role">
                    {props.map.git
                      ? "No commit authors in the scanned window for this area"
                      : "Owner appears once local Git history is indexed"}
                  </div>
                </div>
              </div>
            )}

            {bookmarks.length > 0 ? (
              <>
                <div className="prism-map__sheet-divider" />
                <p className="prism-map__sheet-kicker">Bookmarks</p>
                <ul className="prism-map__sheet-list">
                  {bookmarks.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (b.nodeId) {
                            setSelectedId(b.nodeId);
                            props.onSelectNode?.(b.nodeId);
                          }
                        }}
                      >
                        {b.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <div className="prism-map__sheet-actions">
              <button
                type="button"
                className="prism-map__btn prism-map__btn--primary"
                onClick={() => {
                  const path =
                    selected.kind === "file" || isPathKind(selected.kind)
                      ? selected.id.startsWith("file:")
                        ? selected.id.slice("file:".length)
                        : ((selected.attrs?.path as string | undefined) ??
                          selected.label)
                      : null;
                  if (path && props.onOpenPath) {
                    props.onOpenPath(path);
                    return;
                  }
                  onToggle(selected.id);
                }}
              >
                Open
              </button>
              <button
                type="button"
                className="prism-map__btn prism-map__btn--secondary"
                disabled={!selectedId}
              >
                See impact
              </button>
              <button
                type="button"
                className="prism-map__btn prism-map__btn--ghost"
                onClick={() => {
                  props.onAddBookmark?.(selected.label, selected.id);
                }}
              >
                Bookmark
              </button>
            </div>
          </>
        )}
      </aside>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        searchIndex={props.map.searchIndex}
        levels={UI_ZOOM_LEVELS}
        activeZoom={props.map.zoom}
        onZoom={(z) => props.onZoomChange?.(z)}
        layers={props.map.layers}
        activeLayerIds={activeLayerIds}
        onLayersChange={onLayersChange}
        onSelectNode={(id) => {
          setSelectedId(id);
          props.onSelectNode?.(id);
        }}
      />
    </div>
  );
}
