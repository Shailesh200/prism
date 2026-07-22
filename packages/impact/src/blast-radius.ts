import {
  ok,
  type BlastRadiusReport,
  type PrismError,
  type Result,
} from "@prism/shared";
import {
  affectedItems,
  computeAffected,
  isTestPath,
  type BlastRadiusOrigin,
  type ImpactContext,
} from "./internal.js";

export {
  DEFAULT_BLAST_MAX_DEPTH,
  type BlastRadiusOrigin,
  type ImpactContext,
  type ImpactContext as BlastRadiusOptions,
  type ImpactReference,
  type ImpactSymbol,
} from "./internal.js";

/**
 * Compute the blast radius (reverse-dependency impact) of a change target.
 *
 * Traverses the file dependency graph backwards from the origin — every file
 * that (transitively) imports the origin is "affected". For symbol targets the
 * seeds are the files that reference the symbol; their dependents then cascade.
 *
 * Risk score (0–100, deterministic) =
 *   `55 * reachRatio` (share of the repo impacted)
 *   `+ min(30, directDependents * 5)` (immediate fan-in)
 *   `+ 15` when no affected file looks like a test (untested-change penalty),
 * clamped to [0, 100]. See `plans/milestones/M-020_blast-radius.md`.
 */
export function computeBlastRadius(
  origin: BlastRadiusOrigin,
  options: ImpactContext,
): Result<BlastRadiusReport, PrismError> {
  const result = computeAffected(origin, options);
  if (!result.ok) return result;
  const { originPath, affected, truncated } = result.value;

  const affectedFiles = affectedItems(affected);
  const testsLikelyAffected = affectedFiles
    .map((f) => f.path)
    .filter((p) => isTestPath(p))
    .sort((a, b) => a.localeCompare(b));

  const total = options.analyzedPaths.length;
  const reachRatio = total > 1 ? affectedFiles.length / (total - 1) : 0;
  const directDependents = affectedFiles.filter((f) => f.depth === 1).length;
  const risk = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        55 * reachRatio +
          Math.min(30, directDependents * 5) +
          (testsLikelyAffected.length > 0 ? 0 : 15),
      ),
    ),
  );

  const report: BlastRadiusReport = {
    origin: { kind: origin.kind, id: origin.id, path: originPath },
    risk,
    affectedFiles,
    testsLikelyAffected,
    ...(truncated ? { truncated: true } : {}),
  };
  return ok(report);
}
