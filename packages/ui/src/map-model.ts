import type { MapSearchHit, MapZoomLevel, RepositoryMap } from "@prism/shared";

export const UI_ZOOM_LEVELS: readonly MapZoomLevel[] = [
  "repo",
  "package",
  "feature",
  "file",
  "symbol",
] as const;

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
