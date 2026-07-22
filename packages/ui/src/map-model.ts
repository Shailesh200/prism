import type { MapSearchHit, MapZoomLevel, RepositoryMap } from "@prism/shared";

/**
 * Structural altitudes on the zoom rail (ADR-0013). Feature is intentionally
 * absent: it is a lens/overlay, not an altitude — see {@link FEATURE_LENS_ZOOM}.
 */
export const UI_ZOOM_LEVELS: readonly MapZoomLevel[] = [
  "repo",
  "package",
  "file",
  "symbol",
] as const;

/** The zoom the Feature lens presents (feature-grouped map). */
export const FEATURE_LENS_ZOOM: MapZoomLevel = "feature";

/** Structural altitude the Feature lens visually sits over. */
export const FEATURE_LENS_BASE_ZOOM: MapZoomLevel = "package";

export function filterSearchHits(
  hits: readonly MapSearchHit[],
  query: string,
): MapSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return hits.filter((h) => h.label.toLowerCase().includes(q)).slice(0, 40);
}

export function selectedSearchHit(
  map: RepositoryMap,
  nodeId: string | null,
): MapSearchHit | null {
  if (!nodeId) return null;
  return (
    map.searchIndex.find(
      (h) => h.kind === "node" && h.id === `search:node:${nodeId}`,
    ) ?? null
  );
}
