/**
 * Engine port interfaces — Core depends on these shapes.
 * Concrete packages (indexer, analyzer, …) implement them in later milestones.
 * Surfaces must never import those packages; only Core wires them.
 */

import type { IndexSummary, Result, PrismError } from "@prism/shared";

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

/** Optional deps injected into Prism.create. */
export type PrismEnginePorts = {
  readonly analyzer?: AnalyzerPort;
  readonly indexer?: IndexerPort;
  readonly graphEngine?: GraphEnginePort;
};
