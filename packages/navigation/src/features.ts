import type {
  FeatureInfo,
  GraphSnapshotDto,
  NavigationRouteResult,
} from "@repo-prism/shared";
import { fileNodeId, findPaths, shortestPath } from "./paths.js";

/**
 * Shortest dependency route between any members of two features.
 */
export function navigateFeature(
  dependencyGraph: GraphSnapshotDto,
  features: readonly FeatureInfo[],
  fromFeatureId: string,
  toFeatureId: string,
  options?: { maxAlternatives?: number; maxHops?: number },
): NavigationRouteResult {
  const from = features.find((f) => f.id === fromFeatureId);
  const to = features.find((f) => f.id === toFeatureId);
  if (!from || !to) {
    return { routes: [], empty: true };
  }
  if (from.id === to.id) {
    const hop = from.memberFiles[0];
    if (!hop) return { routes: [], empty: true };
    const node = fileNodeId(hop);
    return {
      routes: [
        {
          from: node,
          to: node,
          hops: [node],
          length: 0,
          kind: "feature",
        },
      ],
      empty: false,
    };
  }

  let best: string[] | null = null;
  for (const a of from.memberFiles) {
    for (const b of to.memberFiles) {
      const path = shortestPath(
        dependencyGraph,
        fileNodeId(a),
        fileNodeId(b),
        options?.maxHops ?? 32,
      );
      if (!path) continue;
      if (!best || path.length < best.length) best = path;
    }
  }

  if (!best) {
    return { routes: [], empty: true };
  }

  // Expand alternatives from the best endpoint pair
  const fromNode = best[0]!;
  const toNode = best[best.length - 1]!;
  return findPaths(dependencyGraph, fromNode, toNode, {
    maxAlternatives: options?.maxAlternatives ?? 1,
    maxHops: options?.maxHops ?? 32,
    kind: "feature",
  });
}
