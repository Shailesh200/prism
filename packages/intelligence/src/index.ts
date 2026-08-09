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
  UTILITY_JOB_BUNDLE_STATS,
  UTILITY_JOB_ECHO,
  UTILITY_JOB_LIGHTHOUSE,
  UTILITY_JOB_REMOTE_PROBE_STUB,
  type BundleAnalyzeJobOptions,
  type LighthouseJobOptions,
  type StartUtilityJobInput,
  type UtilityJobService,
} from "./utilities/jobs.js";
export {
  detectBundleAnalyzeCapability,
  discoverFreshBundleStatsFiles,
} from "./utilities/bundle-detect.js";
export {
  parseBundleStatsJson,
  parseEsbuildMetafile,
  parseNextAnalyze,
  parseRollupVisualizer,
  parseWebpackStats,
} from "./utilities/bundle-parsers.js";
export {
  BUNDLE_WEIGHT_CALLOUT,
  DEFAULT_BUNDLE_THRESHOLDS,
  buildBundleWeightReport,
  emptyUnsupportedBundleReport,
  formatBytes,
} from "./utilities/bundle-weight.js";
export {
  getBundleWeightReport,
  INGEST_KIND_BUNDLE_STATS,
} from "./utilities/bundle-weight-from-artifact.js";
export {
  DEFAULT_BUNDLE_ANALYZE_TIMEOUT_MS,
  runBundleAnalyze,
} from "./utilities/bundle-analyze-runner.js";
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
  heuristicFrontendRoutes,
  normalizeFrontendRoute,
  routeFromPageFilePath,
} from "./utilities/frontend-routes.js";
export { buildPersonaPresets } from "./utilities/presets.js";
export {
  CWV_THRESHOLDS,
  CWV_UNRELIABLE_CEILINGS,
  LIGHTHOUSE_CALLOUT,
  attributionsFromLighthouseAudits,
  attributionsFromPayload,
  buildCwvReport,
  buildCwvRollups,
  categoryScoresFromLighthouse,
  cwvFieldReportFromPagespeedJson,
  cwvMetricsFromLighthouse,
  cwvReportFromLighthouseJson,
  fieldMetricsFromPagespeedJson,
  insightsFromLighthouse,
  labFixtureLighthouseJson,
  labUrlForRoute,
  medianMergeLighthouseReports,
  mergeRouteCwvReports,
  metric,
  metricsFromLighthouseJson,
  pickNumeric,
  pickScore,
  ratingFromMetricValue,
  ratingFromScore,
  routeKeyFromUrl,
  scoreRating,
  tbtMsFromLighthouse,
  unreliableMetricWarnings,
  unwrapLighthouseJson,
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
  expandMountPoints,
  extractExpressLike,
  extractGraphqlJs,
  extractGraphqlSchema,
  extractNest,
  extractProtoServices,
  extractTrpc,
  type BuildBackendReportInput,
} from "./backend/report.js";
export {
  buildCodeExplorerReport,
  type BuildCodeExplorerInput,
} from "./explorer/report.js";
export {
  collectWorkflowDispatchKeys,
  mapGithubAuthenticatedLogin,
  mapGithubRepoInfo,
  mapGithubWorkflowRuns,
  mapGithubWorkflowSummaries,
  matchRemoteWorkflowId,
  parseGithubRepoRef,
  workflowDispatchKey,
  type DispatchWorkflowInput,
  type DispatchWorkflowKind,
  type GithubCiConfig,
  type GithubRepoInfo,
  type GithubWorkflowRun,
  type GithubWorkflowSummary,
} from "./utilities/github-ci.js";
