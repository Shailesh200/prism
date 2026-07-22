/** @prism/intelligence — stack detector SPI (M-040); DNA packs in M-013. */

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
  type AssembleDnaOptions,
} from "./stack/dna.js";
export {
  buildDependencyGraph,
  type DependencyGraphOptions,
  type DependencyGraphResult,
  type UnresolvedDependency,
} from "./dependency/build.js";
export {
  discoverLocalPackages,
  type LocalPackage,
} from "./dependency/packages.js";
export { findCycles } from "./dependency/cycles.js";
export {
  buildKnowledgeGraph,
  findReferences,
  findSymbol,
  type FindReferencesQuery,
  type FindSymbolQuery,
  type KnowledgeGraphResult,
  type KnowledgeGraphStats,
  type ReferenceHit,
  type SymbolHit,
} from "./semantic/build.js";
export {
  buildFeatureGraph,
  listFeatures,
  type FeatureGraphResult,
  type FeatureInfo,
} from "./feature/build.js";
export {
  assembleIntelligenceReport,
  type AssembleIntelligenceOptions,
} from "./intelligence/assemble.js";
export {
  checkIntelligenceConsistency,
  type ConsistencyGraphId,
} from "./intelligence/consistency.js";
export {
  createUtilitiesSession,
  type UtilitiesSession,
  type UtilitiesSessionOptions,
} from "./utilities/session.js";
export {
  createIngestStore,
  type IngestStore,
  type WriteIngestInput,
} from "./utilities/ingest-store.js";
export { createConsentStore, type ConsentStore } from "./utilities/consent.js";
export {
  createUtilityJobService,
  UTILITY_JOB_ECHO,
  UTILITY_JOB_LIGHTHOUSE,
  UTILITY_JOB_REMOTE_PROBE_STUB,
  type LighthouseJobOptions,
  type StartUtilityJobInput,
  type UtilityJobService,
} from "./utilities/jobs.js";
export { buildPersonaPresets } from "./utilities/presets.js";
export {
  LIGHTHOUSE_CALLOUT,
  attributionsFromPayload,
  buildCwvReport,
  buildCwvRollups,
  cwvMetricsFromLighthouse,
  labFixtureLighthouseJson,
} from "./utilities/cwv.js";
export { getCwvReport } from "./utilities/cwv-from-artifact.js";
export {
  HEALTH_FACTOR_WEIGHTS,
  computeHealthScore,
  type HealthFactorId,
} from "./health/score.js";
export {
  computeEngineeringHealth,
  type ComputeEngineeringHealthInput,
} from "./health/engineering.js";
export {
  UTILITY_OVERLAY_CATALOG,
  buildUtilityOverlay,
  listUtilityOverlayKinds,
  parseUtilityOverlayKind,
  type BuildUtilityOverlayInput,
} from "./utilities/overlays.js";
export {
  buildBackendReport,
  extractExpressLike,
  extractNest,
  type BuildBackendReportInput,
} from "./backend/report.js";
