/** @repo-prism/core — public SDK façade (only supported integration surface). */

export { Prism, type PrismClient, type PrismClientOptions } from "./prism.js";
export {
  listIndexedWorkspaces,
  type IndexedWorkspace,
} from "./indexed-roots.js";
export { readChangedPaths, type ChangedPaths } from "./git/changed-paths.js";
export type { PrismGitignoreStatus } from "./git/prism-gitignore.js";
export { loadPrismConfig, loadPrismConfigSync } from "./prism-config-load.js";
export { writePrismConfig } from "./prism-config-write.js";
export type { WritePrismConfigOptions } from "./prism-config-write.js";
export {
  createWorkspace,
  type FindRouteQuery,
  type GetStackProfileOptions,
  type IndexFreshness,
  type KnowledgeGraphView,
  type NotifyWatchPathsInput,
  type PrismWorkspace,
  type ReviewChangesInput,
  type StartWatchOptions,
  type WorkspacePackageInfo,
  type WorkspaceStatus,
} from "./workspace.js";
export type { RouteEndpoint } from "@repo-prism/navigation";
export type {
  DependencyGraphOptions,
  FindReferencesQuery,
  FindReferencesResult,
  FindSymbolQuery,
  ReferenceHit,
  SearchSymbolsQuery,
  SymbolSearchResult,
  SymbolHit,
} from "@repo-prism/intelligence";
export type {
  BackendReport,
  BlastRadiusReport,
  BreakingChangeHint,
  ChangeReviewItem,
  ChangeReviewReport,
  CodeExplorerReport,
  CodeExplorerTarget,
  DnaReport,
  ExplainAreaSummary,
  FeatureInfo,
  GitActivity,
  DependencyGraphDto,
  GraphSnapshotDto,
  IndexSnapshot,
  IndexSummary,
  KnowledgeGraphStats,
  Landmark,
  NavigationRoute,
  NavigationRouteResult,
  PrismError,
  RenameImpactReport,
  Result,
  SafeDeleteReport,
  StackPackageProfile,
  StackProfile,
  TestImpactReport,
  TestingReport,
  ChangeOrigin,
  ImpactEditSite,
} from "@repo-prism/shared";
export { PrismErrorCode, err, ok, prismError } from "@repo-prism/shared";
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
export type { GraphExportResult } from "./graph-export.js";
