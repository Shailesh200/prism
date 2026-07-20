/** @prism/core — public SDK façade (only supported integration surface). */

export { Prism, type PrismClient, type PrismClientOptions } from "./prism.js";
export {
  createWorkspace,
  type PrismWorkspace,
  type WorkspaceStatus,
} from "./workspace.js";
export { STUB_CAPABILITIES, type PrismCapabilities } from "./capabilities.js";
export type {
  AnalyzerPort,
  GraphEnginePort,
  IndexerPort,
  PrismEnginePorts,
} from "./ports.js";
export { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "./version.js";
