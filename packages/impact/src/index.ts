/** @prism/impact — blast radius / change impact engine (M-020). */
export const PACKAGE_NAME = "@prism/impact" as const;

export {
  computeBlastRadius,
  DEFAULT_BLAST_MAX_DEPTH,
  type BlastRadiusOptions,
  type BlastRadiusOrigin,
  type ImpactReference,
  type ImpactSymbol,
} from "./blast-radius.js";
