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
export {
  ensureLighthouseCli,
  isNonAppLabServer,
  lighthouseLooksLikeNotFound,
  looksLikeNotFoundHtml,
  resolveSystemChrome,
  runLighthouseCli,
  resolveReachableLabUrl,
  probeLabUrl,
} from "./utilities/lighthouse-runner.js";
export {
  COMMON_LAB_PORTS,
  PRISM_LAB_PORT,
  detectLabKind,
  discoverLabUrl,
  resolveLabAppRoot,
  resolveLabPreviewStart,
  startLabPreviewServer,
} from "./utilities/lab-server.js";
export {
  discoverFrontendAppRoutes,
  extractFrontendRoutesFromSource,
  normalizeFrontendRoute,
  routeFromPageFilePath,
} from "./utilities/frontend-routes.js";
export { buildPersonaPresets } from "./utilities/presets.js";
export {
  LIGHTHOUSE_CALLOUT,
  attributionsFromLighthouseAudits,
  attributionsFromPayload,
  buildCwvReport,
  buildCwvRollups,
  cwvMetricsFromLighthouse,
  insightsFromLighthouse,
  labFixtureLighthouseJson,
  labUrlForRoute,
  medianMergeLighthouseReports,
  mergeRouteCwvReports,
  routeKeyFromUrl,
  tbtMsFromLighthouse,
} from "./utilities/cwv.js";
export { getCwvReport } from "./utilities/cwv-from-artifact.js";
export {
  HEALTH_FACTOR_WEIGHTS,
  computeHealthScore,
  type ComputeHealthScoreOptions,
  type HealthFactorId,
} from "./health/score.js";
export {
  buildTestingReport,
  ingestCoverageFromWorkspace,
  type BuildTestingReportInput,
} from "./testing/report.js";
export {
  buildSecurityReport,
  type BuildSecurityReportInput,
} from "./security/report.js";
export {
  computeEngineeringHealth,
  type ComputeEngineeringHealthInput,
} from "./health/engineering.js";
export { computeRegionScores } from "./health/regions.js";
export {
  computeRegionMovers,
  pickRegionMoverWindow,
  type RegionMoverWindow,
} from "./health/movers.js";
export { buildHealthHistorySnapshot } from "./health/history.js";
export {
  UTILITY_OVERLAY_CATALOG,
  buildUtilityOverlay,
  extractDesktopIpcChannels,
  listUtilityOverlayKinds,
  parseUtilityOverlayKind,
  type BuildUtilityOverlayInput,
  type DesktopIpcChannel,
} from "./utilities/overlays.js";
export {
  buildBackendReport,
  extractExpressLike,
  extractNest,
  type BuildBackendReportInput,
} from "./backend/report.js";
export {
  buildCodeExplorerReport,
  type BuildCodeExplorerInput,
} from "./explorer/report.js";
