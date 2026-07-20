/** @prism/core — public SDK façade (only supported integration surface). */

export { Prism, type PrismClient, type PrismClientOptions } from "./prism.js";
export {
  createWorkspace,
  type FeatureGraphView,
  type KnowledgeGraphView,
  type PrismWorkspace,
  type WorkspaceStatus,
} from "./workspace.js";
export type {
  DependencyGraphOptions,
  FindReferencesQuery,
  FindSymbolQuery,
  ReferenceHit,
  SymbolHit,
} from "@prism/intelligence";
export type {
  FeatureInfo,
  IntelligenceConsistency,
  IntelligenceReport,
  KnowledgeGraphStats,
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
