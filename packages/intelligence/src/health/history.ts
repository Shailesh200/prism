import type {
  HealthHistoryPoint,
  HealthScore,
  IndexSnapshot,
  RegionHealthPoint,
  SignalProvenance,
} from "@repo-prism/shared";
import { computeHealthScore } from "./score.js";
import { computeRegionScores } from "./regions.js";

/**
 * Build a history payload from the current index.
 *
 * Backfill v1 (ADR-0023): when `at` / `commitSha` come from a historical
 * commit, scores are still computed from the **current** index tree —
 * structural health at HEAD attributed to historical dates until full
 * per-commit recompute exists.
 *
 * That attribution is exactly ADR-0029's `"estimated"`: a real computation
 * assigned to a subject it was not computed for. Callers must pass
 * `backfilled: true` for historical commits so the chart can render those
 * points visibly differently from live samples.
 */
export function buildHealthHistorySnapshot(input: {
  readonly snapshot: IndexSnapshot;
  readonly at: string;
  readonly commitSha?: string;
  readonly health?: HealthScore;
  /** True when `at` / `commitSha` describe a past commit, not the live index. */
  readonly backfilled?: boolean;
}): {
  readonly health: HealthHistoryPoint;
  readonly regions: RegionHealthPoint;
} {
  const healthScore = input.health ?? computeHealthScore(input.snapshot);
  const regions = computeRegionScores(input.snapshot);
  const provenance: SignalProvenance = input.backfilled
    ? "estimated"
    : "measured";
  const meta = {
    at: input.at,
    ...(input.commitSha ? { commitSha: input.commitSha } : {}),
    provenance,
  };
  return {
    health: {
      ...meta,
      score: healthScore.score,
      factors: healthScore.factors.map((f) => ({
        id: f.id,
        score: f.score,
      })),
    },
    regions: {
      ...meta,
      regions,
    },
  };
}
