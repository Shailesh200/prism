import { nodesFromIndexSnapshot } from "@repo-prism/graph-engine";
import {
  type FeatureInfo,
  type GraphEdgeDto,
  type GraphNodeDto,
  type GraphSnapshotDto,
  type IndexSnapshot,
  unsafeEdgeId,
  unsafeNodeId,
} from "@repo-prism/shared";
import {
  isRelativeSpecifier,
  resolveImportTarget,
} from "../dependency/resolve.js";
import { inferFeatures, type FeatureDraft } from "./infer.js";
import { featureNodeId } from "./slug.js";

export type { FeatureInfo };

export type FeatureGraphResult = {
  readonly graph: GraphSnapshotDto;
  readonly features: FeatureInfo[];
};

function fileNodeId(path: string): string {
  return unsafeNodeId(`file:${path}`);
}

function edgeId(kind: string, from: string, to: string): string {
  return unsafeEdgeId(`${kind}:${from}->${to}`);
}

function addEdge(
  edges: Map<string, GraphEdgeDto>,
  kind: string,
  from: string,
  to: string,
  attrs?: GraphEdgeDto["attrs"],
): void {
  const id = edgeId(kind, from, to);
  if (edges.has(id)) return;
  edges.set(id, {
    id,
    kind,
    from: unsafeNodeId(from),
    to: unsafeNodeId(to),
    ...(attrs === undefined ? {} : { attrs }),
  });
}

function toFeatureInfo(draft: FeatureDraft): FeatureInfo {
  return {
    id: featureNodeId(draft.slug),
    name: draft.name,
    slug: draft.slug,
    confidence: draft.confidence,
    memberFiles: [...draft.files].sort((a, b) => a.localeCompare(b)),
    evidence: [...draft.evidence].sort((a, b) => a.localeCompare(b)),
  };
}

function ownerByFile(features: readonly FeatureInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  // Higher confidence wins; then longer path specificity (more files is weaker)
  const ranked = [...features].sort((a, b) => b.confidence - a.confidence);
  for (const f of ranked) {
    for (const path of f.memberFiles) {
      if (!map.has(path)) map.set(path, f.id);
    }
  }
  return map;
}

/**
 * Infer a feature graph from an index snapshot (heuristics v1 — ADR-0011).
 */
export function buildFeatureGraph(snapshot: IndexSnapshot): FeatureGraphResult {
  const drafts = inferFeatures(snapshot);
  const features = drafts.map(toFeatureInfo).sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.slug.localeCompare(b.slug);
  });

  const featureNodes: GraphNodeDto[] = features.map((f) => ({
    id: unsafeNodeId(f.id),
    kind: "feature",
    label: f.name,
    attrs: {
      slug: f.slug,
      confidence: f.confidence,
      memberCount: f.memberFiles.length,
      evidence: f.evidence,
    },
  }));

  const memberPaths = new Set(features.flatMap((f) => f.memberFiles));
  const fileNodes = nodesFromIndexSnapshot(snapshot).filter((n) => {
    const path = typeof n.attrs?.path === "string" ? n.attrs.path : null;
    return path !== null && memberPaths.has(path);
  });

  const edges = new Map<string, GraphEdgeDto>();
  for (const f of features) {
    for (const path of f.memberFiles) {
      addEdge(edges, "contains", f.id, fileNodeId(path));
    }
  }

  const owners = ownerByFile(features);
  const indexedPaths = new Set(
    snapshot.files.filter((f) => f.status === "analyzed").map((f) => f.path),
  );

  for (const file of snapshot.files) {
    if (file.status !== "analyzed") continue;
    const fromFeature = owners.get(file.path);
    if (!fromFeature) continue;
    for (const imp of file.imports) {
      if (!isRelativeSpecifier(imp.source)) continue;
      const target = resolveImportTarget(file.path, imp.source, indexedPaths);
      if (!target) continue;
      const toFeature = owners.get(target);
      if (!toFeature || toFeature === fromFeature) continue;
      addEdge(edges, "related", fromFeature, toFeature, {
        via: `${file.path}->${target}`,
      });
    }
  }

  const nodes = [...featureNodes, ...fileNodes].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const edgeList = [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));

  return {
    graph: {
      id: `features:${snapshot.repoId}`,
      nodes,
      edges: edgeList,
    },
    features,
  };
}

export function listFeatures(result: FeatureGraphResult): FeatureInfo[] {
  return result.features;
}
