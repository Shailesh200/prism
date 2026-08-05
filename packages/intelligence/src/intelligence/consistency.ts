import type {
  FeatureInfo,
  GraphSnapshotDto,
  IntelligenceConsistency,
  IntelligenceConsistencyIssue,
} from "@repo-prism/shared";

export type ConsistencyGraphId = "dependency" | "knowledge" | "feature";

function pathFromFileNode(node: {
  id: string;
  kind: string;
  attrs?: Record<string, unknown> | undefined;
}): string | null {
  if (node.kind !== "file") return null;
  const attrPath = node.attrs?.path;
  if (typeof attrPath === "string" && attrPath.length > 0) return attrPath;
  if (node.id.startsWith("file:")) return node.id.slice("file:".length);
  return null;
}

/**
 * Ensure graph `file` nodes (and feature member files) refer to indexed paths.
 * Issues are reported; the aggregate report still returns ok.
 */
export function checkIntelligenceConsistency(
  indexedPaths: ReadonlySet<string>,
  graphs: ReadonlyArray<{
    id: ConsistencyGraphId;
    graph: GraphSnapshotDto;
  }>,
  features: readonly FeatureInfo[] = [],
): IntelligenceConsistency {
  const issues: IntelligenceConsistencyIssue[] = [];

  for (const { id: graphId, graph } of graphs) {
    for (const node of graph.nodes) {
      const path = pathFromFileNode(node);
      if (path === null) continue;
      if (indexedPaths.has(path)) continue;
      issues.push({
        code: "GRAPH_FILE_NOT_INDEXED",
        graph: graphId,
        nodeId: node.id,
        path,
      });
    }
  }

  for (const feature of features) {
    for (const path of feature.memberFiles) {
      if (indexedPaths.has(path)) continue;
      issues.push({
        code: "GRAPH_FILE_NOT_INDEXED",
        graph: "feature",
        nodeId: feature.id,
        path,
      });
    }
  }

  issues.sort((a, b) =>
    `${a.graph}\0${a.path}\0${a.nodeId}`.localeCompare(
      `${b.graph}\0${b.path}\0${b.nodeId}`,
    ),
  );

  return { ok: issues.length === 0, issues };
}
