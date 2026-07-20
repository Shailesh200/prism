/**
 * Engine port interfaces — Core depends on these shapes.
 * Concrete packages (indexer, analyzer, …) implement them in later milestones.
 * Surfaces must never import those packages; only Core wires them.
 */

import type {
  IndexSummary,
  PrismError,
  Result,
  StackProfile,
} from "@prism/shared";

/** Serializable plugin descriptor exposed through Core (mirrors analyzer SPI). */
export type LanguagePluginInfo = {
  readonly id: string;
  readonly spiVersion: number;
  readonly extensions: readonly string[];
  readonly capabilities: {
    readonly detect: boolean;
    readonly parse: boolean;
    readonly extractSymbols: boolean;
    readonly extractImports: boolean;
  };
};

export type AnalyzerPort = {
  readonly id: string;
  listPlugins(): readonly LanguagePluginInfo[];
  analyzeFile(absolutePath: string): Promise<Result<unknown, PrismError>>;
};

export type IndexerPort = {
  indexWorkspace(
    rootAbsolutePath: string,
  ): Promise<Result<IndexSummary, PrismError>>;
};

export type GraphEnginePort = {
  clear(): void;
  nodeCount(): number;
};

/** Serializable stack detector descriptor (mirrors intelligence SPI). */
export type StackDetectorInfo = {
  readonly id: string;
  readonly spiVersion: number;
  readonly domains: readonly string[];
  readonly personaHints: readonly string[];
};

export type StackPort = {
  readonly id: string;
  listDetectors(): readonly StackDetectorInfo[];
  detectProfile(
    rootAbsolutePath: string,
  ): Promise<Result<StackProfile, PrismError>>;
};

/** Optional deps injected into Prism.create. */
export type PrismEnginePorts = {
  readonly analyzer?: AnalyzerPort;
  readonly indexer?: IndexerPort;
  readonly graphEngine?: GraphEnginePort;
  readonly stack?: StackPort;
};
