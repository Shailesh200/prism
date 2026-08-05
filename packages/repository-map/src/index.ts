/** @repo-prism/repository-map — Map data model (M-017). */

export {
  MAP_ZOOM_LEVELS,
  clusteringNoteFor,
  zoomIn,
  zoomIndex,
  zoomOut,
} from "./zoom.js";
export {
  defaultActiveLayerIds,
  listMapLayerDescriptors,
  resolveActiveLayers,
  heatLayerIds,
} from "./layers.js";
export {
  computeLayerSignals,
  annotateGraphWithLayerSignals,
  heatForActiveLayers,
  type LayerSignalScores,
} from "./layer-signals.js";
export {
  emptyBookmarkStore,
  parseBookmarkStore,
  sortBookmarks,
} from "./bookmarks.js";
export {
  buildRepositoryMap,
  type BuildRepositoryMapInput,
  type MapPackageInfo,
} from "./build.js";

export const PACKAGE_NAME = "@repo-prism/repository-map" as const;
