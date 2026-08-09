/** @repo-prism/impact — blast radius / change impact engine (M-020, M-021). */
export const PACKAGE_NAME = "@repo-prism/impact" as const;

export {
  BLAST_COVERAGE_LIMITATIONS,
  computeBlastRadius,
  DEFAULT_BLAST_MAX_DEPTH,
  FORWARD_DEPENDENCIES_LIMIT,
  classifyToolingRoot,
  isRepoCriticalPath,
  type BlastRadiusOptions,
  type BlastRadiusOrigin,
  type ImpactContext,
  type ImpactReference,
  type ImpactSymbol,
  type SoftImpactEdge,
} from "./blast-radius.js";

export {
  computeBreakingChangeHints,
  computeRenameImpact,
  computeSafeDelete,
  computeTestImpact,
  type RenameTarget,
} from "./change-impact.js";
