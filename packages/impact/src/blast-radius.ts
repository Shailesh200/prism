import {
  ok,
  type BlastRadiusReport,
  type BreakingChangeHint,
  type PrismError,
  type Result,
} from "@prism/shared";
import {
  affectedItems,
  computeAffected,
  CONFIG_FILE_RISK_BOOST,
  CONFIG_FILE_RISK_FLOOR,
  isRepoCriticalPath,
  isTestPath,
  WIDELY_USED_THRESHOLD,
  type BlastRadiusOrigin,
  type ImpactContext,
} from "./internal.js";

/** Severity ordering for deterministic hint sorting (danger first). */
const SEVERITY_RANK: Record<BreakingChangeHint["severity"], number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

/**
 * Deterministic breaking-change hints for a blast-radius result, derived from
 * the origin path, immediate fan-in, test coverage, and truncation. Sorted by
 * severity (danger, warning, info) then message.
 */
function blastBreakingChanges(args: {
  originPath: string;
  directDependents: number;
  affectedCount: number;
  testsAffected: number;
  truncated: boolean;
}): BreakingChangeHint[] {
  const hints: BreakingChangeHint[] = [];

  if (isRepoCriticalPath(args.originPath)) {
    hints.push({
      kind: "config-change",
      severity: "danger",
      message: `Editing a build/config file (${args.originPath}) can affect the whole workspace build.`,
    });
  }
  if (args.directDependents >= WIDELY_USED_THRESHOLD) {
    hints.push({
      kind: "widely-used",
      severity: "warning",
      message: `${args.directDependents} files depend directly on this; breaking its contract impacts many callers.`,
    });
  }
  if (args.testsAffected === 0 && args.affectedCount > 0) {
    hints.push({
      kind: "untested",
      severity: "warning",
      message: "No tests appear to cover the affected files.",
    });
  }
  if (args.truncated) {
    hints.push({
      kind: "partial",
      severity: "info",
      message: "Impact traversal hit the depth limit; results are partial.",
    });
  }

  return hints.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.message.localeCompare(b.message),
  );
}

export {
  DEFAULT_BLAST_MAX_DEPTH,
  isRepoCriticalPath,
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
 *   then for foundational config/build paths (`isRepoCriticalPath`):
 *   `+ CONFIG_FILE_RISK_BOOST` with a floor of `CONFIG_FILE_RISK_FLOOR`,
 * clamped to [0, 100].
 *
 * UI bands (M-046): Low below 20, Moderate 20–60, High 60+.
 * See `plans/milestones/M-020_blast-radius.md`.
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
  let risk = Math.round(
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

  if (isRepoCriticalPath(originPath)) {
    risk = Math.min(
      100,
      Math.max(risk + CONFIG_FILE_RISK_BOOST, CONFIG_FILE_RISK_FLOOR),
    );
  }

  const report: BlastRadiusReport = {
    origin: { kind: origin.kind, id: origin.id, path: originPath },
    risk,
    affectedFiles,
    testsLikelyAffected,
    breakingChanges: blastBreakingChanges({
      originPath,
      directDependents,
      affectedCount: affectedFiles.length,
      testsAffected: testsLikelyAffected.length,
      truncated,
    }),
    ...(truncated ? { truncated: true } : {}),
  };
  return ok(report);
}
