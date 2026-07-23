import type {
  HealthHistoryPoint,
  HealthScore,
  IndexSnapshot,
  RegionHealthPoint,
} from "@prism/shared";
import { computeHealthScore } from "./score.js";
import { computeRegionScores } from "./regions.js";

/**
 * Build a history payload from the current index.
 *
 * Backfill v1 (ADR-0023): when `at` / `commitSha` come from a historical
 * commit, scores are still computed from the **current** index tree —
 * structural health at HEAD attributed to historical dates until full
 * per-commit recompute exists.
 */
export function buildHealthHistorySnapshot(input: {
  readonly snapshot: IndexSnapshot;
  readonly at: string;
  readonly commitSha?: string;
  readonly health?: HealthScore;
}): {
  readonly health: HealthHistoryPoint;
  readonly regions: RegionHealthPoint;
} {
  const healthScore = input.health ?? computeHealthScore(input.snapshot);
  const regions = computeRegionScores(input.snapshot);
  const meta = {
    at: input.at,
    ...(input.commitSha ? { commitSha: input.commitSha } : {}),
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
