/**
 * What to say when a zoom level has nothing to draw.
 *
 * A blank canvas is the one failure mode a map cannot recover from: the user
 * cannot tell whether Prism found nothing, broke, or is still working. That is
 * the same distinction ADR-0029 draws for signals — absent is not zero — and it
 * applies just as much to a whole screen as to a metric.
 *
 * Every message names the mechanism that produced the emptiness, because the
 * useful question is never "why is it blank" but "is that right for my
 * repository". A user who reads "features are inferred from directory
 * structure" can look at their flat `src/` and agree.
 */

import type { MapZoomLevel, RepositoryMap } from "@repo-prism/shared";

export type MapEmptyState = {
  /** The finding, stated plainly. */
  readonly title: string;
  /** Why this zoom produced nothing, in terms of what it measures. */
  readonly detail: string;
  /** Where to go next, or undefined when there is nowhere better. */
  readonly suggestZoom?: MapZoomLevel;
  readonly suggestLabel?: string;
};

const BY_ZOOM: Record<MapZoomLevel, MapEmptyState> = {
  repo: {
    title: "Nothing to place on the map",
    detail:
      "Prism indexed this workspace but found no source it could lay out. Repositories written in languages Prism does not parse are counted, not connected.",
  },
  package: {
    title: "No packages found",
    detail:
      "This zoom draws one node per package manifest below the workspace root. A single-package repository has nothing to spread out here.",
    suggestZoom: "file",
    suggestLabel: "View files",
  },
  feature: {
    title: "No features inferred",
    detail:
      "Prism groups files into features from directory structure and import clustering. A small or flat repository often has nothing to group — that is a fact about the layout, not a failure.",
    suggestZoom: "file",
    suggestLabel: "View files",
  },
  file: {
    title: "No files in the graph",
    detail:
      "This zoom is built from the dependency graph, which covers TypeScript and JavaScript. If the code here is in another language, Prism counted the files but could not read their imports.",
  },
  symbol: {
    title: "No symbols indexed",
    detail:
      "Symbols come from parsing source files. Nothing here parsed into functions, classes or exports.",
    suggestZoom: "file",
    suggestLabel: "View files",
  },
};

/**
 * The empty state for a map, or `null` when it has something to draw.
 *
 * Takes the whole map rather than a count so callers cannot accidentally ask
 * about one zoom while rendering another.
 */
export function mapEmptyState(map: RepositoryMap): MapEmptyState | null {
  if (map.graph.nodes.length > 0) return null;
  return BY_ZOOM[map.zoom] ?? BY_ZOOM.repo;
}
