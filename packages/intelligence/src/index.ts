/** @repo-prism/intelligence — stack detector SPI (M-040); DNA packs in M-013. */

export {
  STACK_DETECTOR_SPI_VERSION,
  STACK_DETECTOR_SPI_VERSION_MAX,
  STACK_DETECTOR_SPI_VERSION_MIN,
} from "./spi-version.js";
export type {
  StackDetectContext,
  StackDetector,
  StackDetectorInfo,
} from "./types.js";
export { StackDetectorRegistry } from "./registry.js";
export {
  createNodejsManifestDetector,
  createUnknownDetector,
} from "./detectors.js";
export {
  createStackHost,
  type StackHost,
  type StackHostOptions,
} from "./host.js";
export {
  discoverPackageRoots,
  type PackageRoot,
} from "./stack/package-roots.js";
export { createDefaultDetectorPacks } from "./stack/packs.js";
export {
  assembleDnaReport,
  enrichStackProfile,
  primaryDomain,
  rankDomainsByConfidence,
  type AssembleDnaOptions,
  type RankedDomainEntry,
} from "./stack/dna.js";
export {
  buildDependencyGraph,
  type DependencyGraphOptions,
  type DependencyGraphResult,
  type UnresolvedDependency,
} from "./dependency/build.js";
export {
  buildSoftImpactIndex,
  matchGlob,
  softEdgesFromOrigin,
  softEdgesToOrigin,
  SOFT_MATCH_CAP,
  type BuildSoftImpactIndexInput,
  type SoftImpactEdge,
  type SoftImpactIndex,
} from "./dependency/soft-impact.js";
export {
  discoverLocalPackages,
  resolveLocalPackageSpecifier,
  packageForFile,
  type LocalPackage,
} from "./dependency/packages.js";
export { findCycles } from "./dependency/cycles.js";
export {
  loadTsconfigPathAliases,
  resolveAliasSpecifier,
  type PathAliasMap,
  type PathAliasRule,
  type TsconfigAliasConfig,
} from "./dependency/aliases.js";
export { cachedKnowledgeGraph } from "./prepare/graph-cache.js";
export {
  buildKnowledgeGraph,
  findReferences,
  findSymbol,
  searchSymbols,
  SEARCH_SYMBOLS_MAX,
  type FindReferencesQuery,
  type FindReferencesResult,
  type FindSymbolQuery,
  type SearchSymbolsQuery,
  type SymbolSearchResult,
  type KnowledgeGraphResult,
  type KnowledgeGraphStats,
  type ReferenceHit,
  type SymbolHit,
} from "./semantic/build.js";
export {
  buildCodeExplorerReport,
  type BuildCodeExplorerInput,
} from "./explorer/report.js";
export {
  buildPrepareChange,
  tokenizeTask,
  scoreReuse,
  type BuildPrepareChangeInput,
  type PrepareMemory,
} from "./prepare/pack.js";
export { buildWorkOrder, isWorkOrderHookArmed } from "./prepare/work-order.js";
export { collectRationale } from "./semantic/rationale.js";
export { checkGuardSession, type GuardCheckInput } from "./guard/session.js";
export {
  listFindings,
  findingStillOpen,
  listUnusedExportFindings,
  UNUSED_EXPORT_SOURCE,
  listDuplicateImplementationFindings,
  DUPLICATE_IMPLEMENTATION_SOURCE,
  listWrapperOverExistingFindings,
  WRAPPER_OVER_EXISTING_SOURCE,
  computeFindingFingerprint,
  normalizeFindingTitle,
} from "./findings/index.js";
