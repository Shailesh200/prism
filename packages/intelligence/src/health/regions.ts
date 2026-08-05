import type { IndexSnapshot, RegionHealthPoint } from "@repo-prism/shared";
import { buildDependencyGraph } from "../dependency/build.js";
import { buildFeatureGraph } from "../feature/build.js";

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Derive up to 8 feature/package regions with a coupling-based health score
 * from the current index snapshot (same heuristic family as Overview).
 */
export function computeRegionScores(
  snapshot: IndexSnapshot,
): RegionHealthPoint["regions"] {
  const features = buildFeatureGraph(snapshot).features;
  const { graph } = buildDependencyGraph(snapshot);
  const degreeByPath = new Map<string, number>();
  for (const e of graph.edges) {
    degreeByPath.set(e.from, (degreeByPath.get(e.from) ?? 0) + 1);
    degreeByPath.set(e.to, (degreeByPath.get(e.to) ?? 0) + 1);
  }
  const maxDegree = Math.max(1, ...degreeByPath.values(), 1);

  const fileDegree = (path: string): number =>
    degreeByPath.get(`file:${path}`) ?? 0;

  const regions = features.slice(0, 8).map((f) => {
    const files = f.memberFiles.length;
    let degreeSum = 0;
    for (const path of f.memberFiles) {
      degreeSum += fileDegree(path);
    }
    const avgDegree = files > 0 ? degreeSum / files : 0;
    const score = clampScore(100 - (avgDegree / maxDegree) * 55);
    return {
      id: f.id,
      label: f.name,
      score,
      files,
    };
  });

  if (regions.length > 0) return regions;

  // Fallback: top-level path prefixes when no features inferred.
  const prefixes = new Map<string, { files: number; degree: number }>();
  for (const file of snapshot.files) {
    const top = file.path.split("/")[0] ?? file.path;
    const prev = prefixes.get(top) ?? { files: 0, degree: 0 };
    prev.files += 1;
    prev.degree += fileDegree(file.path);
    prefixes.set(top, prev);
  }
  return [...prefixes.entries()]
    .sort((a, b) => b[1].files - a[1].files)
    .slice(0, 8)
    .map(([id, info]) => {
      const avg = info.files > 0 ? info.degree / info.files : 0;
      return {
        id: `folder:${id}`,
        label: id,
        score: clampScore(100 - (avg / maxDegree) * 55),
        files: info.files,
      };
    });
}
