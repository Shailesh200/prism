/**
 * The workspace reads `graph()` and `exportGraph()` use. A narrow interface
 * of its own so those modules do not import `workspace.ts`, which imports
 * them: that cycle showed up in the first graph export of this repo.
 */

import type {
  FindReferencesQuery,
  FindReferencesResult,
  FindSymbolQuery,
  SearchSymbolsQuery,
  SymbolHit,
  SymbolSearchResult,
} from "@repo-prism/intelligence";
import type { RouteEndpoint } from "@repo-prism/navigation";
import type {
  DependencyGraphDto,
  ExplainAreaSummary,
  GraphSnapshotDto,
  IndexSnapshot,
  NavigationRouteResult,
  PrismError,
  Result,
  TestImpactReport,
} from "@repo-prism/shared";

export type GraphReads = {
  readonly rootPath: string;
  getIndex(): Result<IndexSnapshot, PrismError>;
  getDependencyGraph(): Result<DependencyGraphDto, PrismError>;
  getCycles(): Result<string[][], PrismError>;
  getKnowledgeGraph(): Result<{ readonly graph: GraphSnapshotDto }, PrismError>;
  findSymbol(query: FindSymbolQuery): Result<SymbolHit[], PrismError>;
  searchSymbols(
    query: SearchSymbolsQuery,
  ): Result<SymbolSearchResult, PrismError>;
  findReferences(
    query: FindReferencesQuery,
  ): Result<FindReferencesResult, PrismError>;
  findRoute(query: {
    readonly from: RouteEndpoint;
    readonly to: RouteEndpoint;
    readonly maxAlternatives?: number;
    readonly maxHops?: number;
  }): Result<NavigationRouteResult, PrismError>;
  testImpact(input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }): Promise<Result<TestImpactReport, PrismError>>;
  explainArea(path: string): Promise<Result<ExplainAreaSummary, PrismError>>;
  listPackages(): Promise<
    Result<
      readonly { readonly id: string; readonly rootDir: string }[],
      PrismError
    >
  >;
};
