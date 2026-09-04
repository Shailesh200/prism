/** @repo-prism/ui — shared Map / explorer React components (M-018). */

export {
  RepositoryMapView,
  relativeTime,
  type RepositoryMapViewProps,
} from "./RepositoryMapView.js";
export {
  formatPrismDate,
  relativePrismTime,
  type FormatPrismDateStyle,
} from "./format-prism-date.js";
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
export { mapEmptyState, type MapEmptyState } from "./map-empty.js";
export {
  UI_ZOOM_LEVELS,
  FEATURE_LENS_ZOOM,
  FEATURE_LENS_BASE_ZOOM,
  filterSearchHits,
  selectedSearchHit,
} from "./map-model.js";
export { isPathKind, splitRepoPath } from "./map-path.js";
export { resolveFileType, type FileTypeInfo } from "./file-type.js";
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

export { Input, type InputProps } from "./Input.js";
export { Textarea, type TextareaProps } from "./Textarea.js";
export { Select, type SelectOption, type SelectProps } from "./Select.js";
export {
  SearchableInput,
  type SearchableInputProps,
} from "./SearchableInput.js";
export {
  ToggleGroup,
  type ToggleGroupOption,
  type ToggleGroupProps,
} from "./ToggleGroup.js";
export { Tabs, type TabsOption, type TabsProps } from "./Tabs.js";
export {
  Tooltip,
  InfoTip,
  type TooltipProps,
  type TooltipAlign,
} from "./Tooltip.js";
export { CardIcon, type CardIconProps, type CardIconTone } from "./CardIcon.js";
export { EmptyState, type EmptyStateProps } from "./EmptyState.js";

export {
  PRISM_DURATION,
  PRISM_EASE,
  motionDuration,
  prefersReducedMotion,
  staggerStep,
} from "./motion.js";

export const PACKAGE_NAME = "@repo-prism/ui" as const;
