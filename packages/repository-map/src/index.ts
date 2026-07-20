/** @prism/repository-map — Map data model (M-017). */

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
} from "./layers.js";
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

export const PACKAGE_NAME = "@prism/repository-map" as const;
