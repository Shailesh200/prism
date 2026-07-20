import type { MapZoomLevel } from "@prism/shared";

export const MAP_ZOOM_LEVELS: readonly MapZoomLevel[] = [
  "repo",
  "package",
  "feature",
  "file",
  "symbol",
] as const;

export function zoomIndex(level: MapZoomLevel): number {
  return MAP_ZOOM_LEVELS.indexOf(level);
}

/** Next finer zoom, or same if already at symbol. */
export function zoomIn(level: MapZoomLevel): MapZoomLevel {
  const i = zoomIndex(level);
  if (i < 0 || i >= MAP_ZOOM_LEVELS.length - 1) return level;
  return MAP_ZOOM_LEVELS[i + 1]!;
}

/** Next coarser zoom, or same if already at repo. */
export function zoomOut(level: MapZoomLevel): MapZoomLevel {
  const i = zoomIndex(level);
  if (i <= 0) return level;
  return MAP_ZOOM_LEVELS[i - 1]!;
}

export function clusteringNoteFor(zoom: MapZoomLevel): string {
  switch (zoom) {
    case "repo":
      return "Single workspace cluster; drill into packages";
    case "package":
      return "One node per local package / app root";
    case "feature":
      return "One node per inferred feature";
    case "file":
      return "File nodes from the dependency graph";
    case "symbol":
      return "Symbol nodes from indexed files (top symbols per file)";
    default:
      throw new Error(`Unhandled zoom: ${String(zoom)}`);
  }
}
