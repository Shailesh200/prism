import type { RegionHealthPoint, RegionMoversReport } from "@prism/shared";

export type RegionMoverWindow = {
  readonly from: RegionHealthPoint;
  readonly to: RegionHealthPoint;
};

/**
 * Compare two region snapshots: improving (delta > 0) and regressing
 * (delta < 0), each sorted by |delta| descending.
 */
export function computeRegionMovers(
  from: RegionHealthPoint,
  to: RegionHealthPoint,
): RegionMoversReport {
  const fromById = new Map(from.regions.map((r) => [r.id, r]));
  const improving: RegionMoversReport["improving"] = [];
  const regressing: RegionMoversReport["regressing"] = [];

  for (const next of to.regions) {
    const prev = fromById.get(next.id);
    if (!prev) continue;
    const delta = next.score - prev.score;
    if (delta === 0) continue;
    const entry = {
      id: next.id,
      label: next.label,
      fromScore: prev.score,
      toScore: next.score,
      delta,
    };
    if (delta > 0) improving.push(entry);
    else regressing.push(entry);
  }

  const byAbsDelta = (a: { delta: number }, b: { delta: number }): number =>
    Math.abs(b.delta) - Math.abs(a.delta);

  improving.sort(byAbsDelta);
  regressing.sort(byAbsDelta);
  return { improving, regressing };
}

/**
 * Pick the comparison window: latest two snapshots, or first/last when more
 * than two exist in the provided chronological list.
 */
export function pickRegionMoverWindow(
  points: readonly RegionHealthPoint[],
): RegionMoverWindow | null {
  if (points.length < 2) return null;
  if (points.length === 2) {
    return { from: points[0]!, to: points[1]! };
  }
  return { from: points[0]!, to: points[points.length - 1]! };
}
