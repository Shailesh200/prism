/**
 * `graph.json` (M-096, ADR-0062). The export is the
 * versioned, documented form of Prism's graph; the report lists only what was
 * measured, so every line can be checked against the code.
 */

import type { GraphProvenance } from "./graph-query.js";

export const GRAPH_EXPORT_VERSION = 1 as const;

export type GraphExportNode = {
  /** `package:<id>`, `file:<path>`, `symbol:<path>#<name>`, or `adr:<path>`. */
  readonly id: string;
  readonly kind: "package" | "file" | "test" | "symbol" | "adr";
  readonly label: string;
  readonly path?: string;
  /** Owning package id, for files and symbols. */
  readonly package?: string;
};

export type GraphExportEdge = {
  readonly kind:
    | "contains"
    | "imports"
    | "tests"
    | "declares"
    | "rationale_for";
  readonly from: string;
  readonly to: string;
  readonly provenance: GraphProvenance;
};

export type GraphExport = {
  readonly version: typeof GRAPH_EXPORT_VERSION;
  readonly generatedAt: string;
  readonly indexedAt: string;
  /** Folder name only: the export is meant to be shareable. */
  readonly repository: string;
  readonly nodes: readonly GraphExportNode[];
  readonly edges: readonly GraphExportEdge[];
  readonly stats: {
    readonly packages: number;
    readonly files: number;
    readonly tests: number;
    readonly symbols: number;
    readonly edges: number;
  };
};
