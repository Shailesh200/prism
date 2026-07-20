import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type {
  GraphNodeDto,
  MapBookmark,
  MapZoomLevel,
  RepositoryMap,
} from "@prism/shared";
import { layoutCardTree, toggleExpanded } from "./card-tree-layout.js";
import { DensityMap } from "./DensityMap.js";
import type { DensityMode } from "./density-layout.js";
import {
  cardEntriesAt,
  drillScopeFromMapNode,
  findTreeEntryById,
  folderCardEntries,
  nodesFromMemberFiles,
  scopeGraphNodes,
} from "./file-scope.js";
import type { TreeEntry } from "./file-tree.js";
import { layoutOverviewGraph } from "./overview-layout.js";

type TreeScope = {
  readonly memberFiles?: readonly string[];
  /** Show this folder's children as the tree roots (packages). */
  readonly folderPath?: string;
};
import { MapControls } from "./MapControls.js";
import { MapNode } from "./MapNode.js";
import { filterSearchHits, UI_ZOOM_LEVELS } from "./map-model.js";
import { isPathKind } from "./map-path.js";
import { resolveFileType } from "./file-type.js";
import "@xyflow/react/dist/style.css";

export type RepositoryMapViewProps = {
  readonly map: RepositoryMap;
  readonly bookmarks?: readonly MapBookmark[];
  readonly brandMarkSrc?: string;
  readonly onZoomChange?: (zoom: MapZoomLevel) => void;
  readonly onAddBookmark?: (label: string, nodeId: string) => void;
  readonly onSelectNode?: (nodeId: string | null) => void;
};

const nodeTypes = { prism: MapNode };

const defaultEdgeOptions = {
  type: "smoothstep" as const,
  style: {
    stroke: "rgba(15, 118, 110, 0.32)",
    strokeWidth: 1.4,
  },
};

const ZOOM_LABELS: Record<MapZoomLevel, string> = {
  repo: "Repo",
  package: "Package",
  feature: "Feature",
  file: "File",
  symbol: "Symbol",
};

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
    const confidence = attrs?.confidence;
    if (typeof confidence === "number" && typeof count === "number") {
      return `${Math.round(confidence * 100)}% · ${count} files`;
    }
    if (typeof confidence === "number") {
      return `${Math.round(confidence * 100)}% confidence`;
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
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  dimLayers: boolean;
}): ReactElement {
  const { fitView } = useReactFlow();
  const onToggleRef = useRef(props.onToggle);
  onToggleRef.current = props.onToggle;
  const expandKey = [...props.expanded].sort().join(",");
  const scopeKey = `${props.scope?.folderPath ?? ""}|${props.scope?.memberFiles?.join(",") ?? ""}`;
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
    setNodes(
      next.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onToggle: () => onToggleRef.current(node.id),
        },
      })),
    );
    setEdges(next.edges);
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.28, duration: 380 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [
    props.map,
    props.selectedId,
    expandKey,
    scopeKey,
    fitView,
    setNodes,
    setEdges,
    props.expanded,
    props.scope,
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
        <Background
          id="prism-topo"
          variant={BackgroundVariant.Dots}
          gap={26}
          size={1}
          color="rgba(90, 107, 118, 0.22)"
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

  return {
    id: entry.nodeId ?? entry.id,
    kind: entry.kind,
    label: entry.kind === "symbol" ? entry.name : entry.path || entry.name,
    attrs: { path: entry.path },
  };
}

export function RepositoryMapView(props: RepositoryMapViewProps): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dim, setDim] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [treeScope, setTreeScope] = useState<TreeScope | null>(null);
  const [pendingScope, setPendingScope] = useState<TreeScope | null>(null);
  /** File zoom preview: card tree vs density maps. */
  const [fileView, setFileView] = useState<"cards" | DensityMode>("treemap");

  const bookmarks = props.bookmarks ?? props.map.bookmarks;
  const hits = filterSearchHits(props.map.searchIndex, query);
  const selected = selectedId
    ? resolveCardNode(props.map, selectedId, treeScope)
    : undefined;
  const markSrc = props.brandMarkSrc ?? "/brand/prism-mark.png";
  const selectedIsPath = selected ? isPathKind(selected.kind) : false;
  const selectedType =
    selectedIsPath && selected ? resolveFileType(selected.label) : null;

  const densityNodes = useMemo(() => {
    if (treeScope?.memberFiles?.length) {
      return nodesFromMemberFiles(treeScope.memberFiles);
    }
    if (treeScope?.folderPath) {
      return scopeGraphNodes(props.map.graph.nodes, {
        title: treeScope.folderPath,
        kind: "folder",
        sourceNodeId: `folder:${treeScope.folderPath}`,
        pathPrefix: treeScope.folderPath,
      });
    }
    return props.map.graph.nodes;
  }, [props.map.graph.nodes, treeScope]);

  const visibleCount = useMemo(() => {
    if (!isFileZoom(props.map.zoom)) return props.map.graph.nodes.length;
    if (fileView !== "cards")
      return densityNodes.filter((n) => n.kind === "file").length;
    return layoutCardTree(
      treeRootsForMap(props.map, treeScope),
      expanded,
      selectedId,
    ).nodes.length;
  }, [props.map, treeScope, expanded, selectedId, fileView, densityNodes]);

  useEffect(() => {
    setDim(true);
    const t = window.setTimeout(() => setDim(false), 200);
    return () => window.clearTimeout(t);
  }, [props.map.zoom, props.map.activeLayerIds.join(",")]);

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

  return (
    <div className="prism-map prism-theme">
      <header className="prism-map__top">
        <div className="prism-map__brand">
          <img src={markSrc} alt="" width={22} height={22} />
          <span>Prism</span>
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
          <span className="prism-map__status">{visibleCount} on map</span>
          <span className="prism-map__top-sep" aria-hidden />
          <button type="button" className="prism-map__link">
            Views
          </button>
          <button type="button" className="prism-map__link">
            Reindex
          </button>
        </div>
      </header>

      <main className="prism-map__stage">
        {isFileZoom(props.map.zoom) && fileView !== "cards" ? (
          <DensityMap
            nodes={densityNodes}
            mode={fileView}
            selectedId={selectedId}
            onModeChange={setFileView}
            onSelect={(id, label) => {
              setSelectedId(id);
              props.onSelectNode?.(id);
              if (label) setQuery(label);
            }}
          />
        ) : (
          <ReactFlowProvider>
            <MapCanvas
              map={props.map}
              selectedId={selectedId}
              expanded={expanded}
              scope={treeScope}
              dimLayers={dim}
              onSelect={(id) => {
                if (id?.startsWith("group:")) return;
                setSelectedId(id);
                props.onSelectNode?.(id);
              }}
              onToggle={onToggle}
            />
          </ReactFlowProvider>
        )}

        {isFileZoom(props.map.zoom) ? (
          <div
            className="prism-map__view-switch"
            role="toolbar"
            aria-label="File view"
          >
            {(
              [
                ["treemap", "Treemap"],
                ["icicle", "Icicle"],
                ["cards", "Cards"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-active={fileView === id ? "true" : "false"}
                onClick={() => setFileView(id)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="prism-map__legend" aria-hidden>
          {isFileZoom(props.map.zoom)
            ? fileView === "cards"
              ? "Double-click a folder to expand its tree"
              : "File density — double-click folders, area ∝ files"
            : "Clusters by scope — select a card to see links, double-click to open"}
        </div>

        <div className="prism-map__zoom" role="toolbar" aria-label="Zoom level">
          {UI_ZOOM_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              data-active={props.map.zoom === level ? "true" : "false"}
              onClick={() => props.onZoomChange?.(level)}
            >
              {ZOOM_LABELS[level]}
            </button>
          ))}
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
                ? fileView === "cards"
                  ? "Click a card to inspect it. Double-click a folder to expand children below."
                  : "Treemap/Icicle show where code mass lives (by file count). Click a cell to select. Switch to Cards for browse-to-open."
                : "Features are grouped by scope. Select a card to reveal its links; double-click to open files."}
            </p>
            <div className="prism-map__sheet-divider" />
            <p className="prism-map__sheet-kicker">Layers</p>
            <p className="prism-map__sheet-layers">
              {props.map.activeLayerIds.join(" · ")}
            </p>
          </>
        ) : (
          <>
            <p className="prism-map__sheet-kicker">
              {`Selected ${selected.kind}`}
              {selectedType ? ` · ${selectedType.label}` : ""}
            </p>
            <h2
              className="prism-map__sheet-title"
              data-mono={selectedIsPath ? "true" : "false"}
            >
              {selected.label}
            </h2>
            <p className="prism-map__sheet-copy">{props.map.clusteringNote}</p>

            <div className="prism-map__sheet-divider" />

            <p className="prism-map__sheet-kicker">Bookmarks</p>
            {bookmarks.length === 0 ? (
              <p className="prism-map__sheet-muted">None yet</p>
            ) : (
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
            )}

            <div className="prism-map__sheet-actions">
              <button
                type="button"
                className="prism-map__btn prism-map__btn--ghost"
                onClick={() => {
                  props.onAddBookmark?.(selected.label, selected.id);
                }}
              >
                Bookmark
              </button>
              <button
                type="button"
                className="prism-map__btn prism-map__btn--secondary"
                disabled={!selectedId}
              >
                See impact
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
