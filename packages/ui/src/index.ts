/** @prism/ui — shared Map / explorer React components (M-018). */

export {
  RepositoryMapView,
  relativeTime,
  type RepositoryMapViewProps,
} from "./RepositoryMapView.js";
export { MapNode, type PrismMapNodeData } from "./MapNode.js";
export { MapControls } from "./MapControls.js";
export { MapLayersPanel, type MapLayersPanelProps } from "./MapLayersPanel.js";
export {
  dominantHeat,
  heatBand,
  parseLayerSignals,
  toggleLayer,
  LAYER_TINT,
} from "./map-layers.js";
export {
  UI_ZOOM_LEVELS,
  FEATURE_LENS_ZOOM,
  FEATURE_LENS_BASE_ZOOM,
  filterSearchHits,
  selectedSearchHit,
} from "./map-model.js";
export { isPathKind, splitRepoPath } from "./map-path.js";
export { resolveFileType, type FileTypeInfo } from "./file-type.js";
export { FileTypeIcon } from "./FileTypeIcon.js";
export {
  MaterialFileIcon,
  type MaterialFileIconProps,
} from "./MaterialFileIcon.js";
export {
  materialIconForFile,
  materialIconForFolder,
  materialSvg,
} from "./material-file-icon.js";
export { FileExplorer, type FileExplorerProps } from "./FileExplorer.js";
export {
  buildFileTreeIndex,
  defaultExpandedIds,
  expandPathTo,
  flattenVisible,
  type FileTreeIndex,
  type TreeEntry,
  type FlatTreeRow,
} from "./file-tree.js";
export {
  cardEntriesAt,
  drillScopeFromMapNode,
  findTreeEntryById,
  folderCardEntries,
  nodesFromMemberFiles,
  parentFolderPath,
  scopeGraphNodes,
  type CardBrowse,
  type DrillScope,
} from "./file-scope.js";
export {
  layoutCardTree,
  toggleExpanded,
  collapseExpanded,
  cardsOverlap,
  resolveCardOverlaps,
} from "./card-tree-layout.js";
export {
  layoutOverviewGraph,
  clusterKeyForLabel,
  shortLabelInCluster,
} from "./overview-layout.js";
export { DensityMap, type DensityMapProps } from "./DensityMap.js";
export {
  OverviewTreemap,
  type OverviewTreemapProps,
} from "./OverviewTreemap.js";
export {
  squarifyTreemap,
  type TreemapCell,
  type TreemapItem,
} from "./overview-treemap.js";
export {
  layoutDensity,
  layoutTreemap,
  layoutIcicle,
  type DensityMode,
  type DensityRect,
} from "./density-layout.js";
export { treeEntriesToTreemapPoints } from "./highcharts-treemap-data.js";

export const PACKAGE_NAME = "@prism/ui" as const;
