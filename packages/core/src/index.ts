/** @prism/core — public SDK façade (only supported integration surface). */

export { Prism, type PrismClient, type PrismClientOptions } from "./prism.js";
export {
  createWorkspace,
  type FeatureGraphView,
  type FindRouteQuery,
  type GetRepositoryMapOptions,
  type GetStackProfileOptions,
  type GetUtilityOverlayOptions,
  type KnowledgeGraphView,
  type PrismWorkspace,
  type WorkspacePackageInfo,
  type WorkspaceStatus,
} from "./workspace.js";
export type { RouteEndpoint } from "@prism/navigation";
export type {
  DependencyGraphOptions,
  FindReferencesQuery,
  FindSymbolQuery,
  ReferenceHit,
  StartUtilityJobInput,
  SymbolHit,
} from "@prism/intelligence";
export {
  UTILITY_JOB_ECHO,
  UTILITY_JOB_LIGHTHOUSE,
  UTILITY_JOB_REMOTE_PROBE_STUB,
} from "@prism/intelligence";
export type {
  BackendReport,
  BlastRadiusReport,
  BreakingChangeHint,
  ChangeOrigin,
  CodeExplorerReport,
  CodeExplorerTarget,
  ConsentRecord,
  CwvReport,
  DnaReport,
  EngineeringHealthReport,
  FeatureInfo,
  GitActivity,
  GraphSnapshotDto,
  HealthScore,
  ImpactEditSite,
  IndexSnapshot,
  IndexSummary,
  IngestArtifact,
  IngestArtifactMeta,
  IntelligenceConsistency,
  IntelligenceReport,
  KnowledgeGraphStats,
  Landmark,
  MapZoomLevel,
  NavigationRoute,
  NavigationRouteResult,
  PersonaPresets,
  PrismError,
  RenameImpactReport,
  RepositoryMap,
  Result,
  SafeDeleteReport,
  StackPackageProfile,
  StackProfile,
  TestImpactReport,
  UtilityJob,
  UtilityOverlayKind,
  UtilityOverlayKindInfo,
  UtilityOverlayReport,
} from "@prism/shared";
export { PrismErrorCode, err, ok, prismError } from "@prism/shared";
export { STUB_CAPABILITIES, type PrismCapabilities } from "./capabilities.js";
export type {
  AnalyzerPort,
  GraphEnginePort,
  IndexerPort,
  LanguagePluginInfo,
  PrismEnginePorts,
  StackDetectorInfo,
  StackPort,
} from "./ports.js";
export { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "./version.js";
