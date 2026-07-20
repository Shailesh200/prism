/** @prism/shared — contracts, errors, IDs, paths, Zod DTOs */

export {
  err,
  isErr,
  isOk,
  mapResult,
  ok,
  unwrap,
  type Result,
} from "./result.js";

export {
  PrismErrorCode,
  isPrismError,
  prismError,
  type PrismError,
  type PrismErrorCode as PrismErrorCodeType,
} from "./errors.js";

export {
  asEdgeId,
  asFeatureId,
  asFileId,
  asNodeId,
  asRepoId,
  asSymbolId,
  unsafeEdgeId,
  unsafeFeatureId,
  unsafeFileId,
  unsafeNodeId,
  unsafeRepoId,
  unsafeSymbolId,
  type EdgeId,
  type FeatureId,
  type FileId,
  type NodeId,
  type RepoId,
  type SymbolId,
} from "./ids.js";

export {
  isRepoRelativePath,
  joinRepoPath,
  normalizeRepoPath,
  type RepoRelativePath,
} from "./paths.js";

export {
  BlastRadiusItemSchema,
  BlastRadiusReportSchema,
  DnaReportSchema,
  HealthScoreSchema,
  IndexFileStatsSchema,
  IndexSummarySchema,
  JsonValueSchema,
  PrismErrorSchema,
  RepoRelativePathSchema,
  parseDto,
  type BlastRadiusReport,
  type DnaReport,
  type HealthScore,
  type IndexSummary,
  type JsonValue,
  type PrismErrorDto,
} from "./schemas.js";
