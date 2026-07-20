/**
 * Engine port interfaces — Core depends on these shapes.
 * Concrete packages (indexer, analyzer, …) implement them in later milestones.
 * Surfaces must never import those packages; only Core wires them.
 */

import type { IndexSummary, Result, PrismError } from "@prism/shared";

export type AnalyzerPort = {
  readonly id: string;
  /** Parse/extract placeholder — not implemented in M-003. */
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

/** Optional deps injected into Prism.create (all optional in M-003). */
export type PrismEnginePorts = {
  readonly analyzer?: AnalyzerPort;
  readonly indexer?: IndexerPort;
  readonly graphEngine?: GraphEnginePort;
};
