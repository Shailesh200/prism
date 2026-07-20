/** @prism/core — public SDK façade (only supported integration surface). */

export { Prism, type PrismClient, type PrismClientOptions } from "./prism.js";
export {
  createWorkspace,
  type FeatureGraphView,
  type GetStackProfileOptions,
  type GetUtilityOverlayOptions,
  type KnowledgeGraphView,
  type PrismWorkspace,
  type WorkspacePackageInfo,
  type WorkspaceStatus,
} from "./workspace.js";
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
  ConsentRecord,
  CwvReport,
  FeatureInfo,
  IngestArtifact,
  IngestArtifactMeta,
  IntelligenceConsistency,
  IntelligenceReport,
  KnowledgeGraphStats,
  PersonaPresets,
  StackPackageProfile,
  StackProfile,
  UtilityJob,
  UtilityOverlayKind,
  UtilityOverlayKindInfo,
  UtilityOverlayReport,
} from "@prism/shared";
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
