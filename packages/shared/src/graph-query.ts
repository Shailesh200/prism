/**
 * The `graph` tool contract (M-096, ADR-0062): one bounded way to ask the
 * repository graph a structural question. Answers carry provenance on every
 * edge and fit a token budget, with `truncated` saying when they were cut.
 */

import type { ExplainAreaSummary, NavigationRoute } from "./schemas.js";

export const GRAPH_MODES = [
  "find",
  "neighbors",
  "path",
  "explain",
  "query",
] as const;
export type GraphMode = (typeof GRAPH_MODES)[number];

export const GRAPH_QUERY_FILTERS = [
  "tests_reaching",
  "importers_of",
  "imports_of",
  "files_in_importing",
] as const;
export type GraphQueryFilter = (typeof GRAPH_QUERY_FILTERS)[number];

/** Default answer size, bytes ÷ 4 like every other Prism budget. */
export const GRAPH_DEFAULT_BUDGET = 1_500;
export const GRAPH_MAX_BUDGET = 6_000;

/** A file, or a symbol (optionally pinned to the file that declares it). */
export type GraphEndpoint = {
  readonly path?: string;
  readonly symbol?: string;
};

export type GraphQuery =
  | {
      readonly mode: "find";
      readonly name: string;
      readonly kind?: string;
    }
  | {
      readonly mode: "neighbors";
      readonly target: GraphEndpoint;
      readonly direction?: "in" | "out" | "both";
    }
  | {
      readonly mode: "path";
      readonly from: GraphEndpoint;
      readonly to: GraphEndpoint;
      readonly maxHops?: number;
      readonly maxAlternatives?: number;
    }
  | { readonly mode: "explain"; readonly path: string }
  | {
      readonly mode: "query";
      readonly filter: GraphQueryFilter;
      readonly target: string;
      /** `files_in_importing`: the folder to look in. */
      readonly within?: string;
    };

export type GraphProvenance = "measured" | "heuristic" | "inferred";

export type GraphNode = {
  readonly kind: "file" | "symbol" | "test";
  readonly path: string;
  readonly name?: string;
  readonly symbolKind?: string;
  /** 1-based declaration line (find mode). */
  readonly line?: number;
  /** Barrels that re-export this declaration (find mode, plan §4.5). */
  readonly reexportedBy?: readonly string[];
};

export type GraphEdgeKind =
  | "imports"
  | "imported_by"
  | "references"
  | "declared_in"
  | "tests";

export type GraphEdge = {
  readonly kind: GraphEdgeKind;
  readonly from: string;
  readonly to: string;
  readonly provenance: GraphProvenance;
};

export type GraphAnswer = {
  readonly mode: GraphMode;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly routes?: readonly NavigationRoute[];
  readonly explain?: ExplainAreaSummary;
  /** Several declarations share the name: pick one and ask again with `path`. */
  readonly ambiguous?: boolean;
  /** Nodes plus edges before the budget cut. */
  readonly totalCount: number;
  readonly truncated: boolean;
  readonly budget: number;
  readonly tokenEstimate: number;
  /** Plain-language note when the answer is empty or partial. */
  readonly note?: string;
};

export function clampGraphBudget(budget: number | undefined): number {
  if (budget === undefined || !Number.isFinite(budget)) {
    return GRAPH_DEFAULT_BUDGET;
  }
  return Math.min(GRAPH_MAX_BUDGET, Math.max(200, Math.round(budget)));
}

function estimate(value: unknown): number {
  return Math.ceil(new TextEncoder().encode(JSON.stringify(value)).length / 4);
}

/**
 * Cut edges, then nodes, from the end until the answer fits. Order matters:
 * callers put the most relevant rows first.
 */
export function fitGraphAnswer(
  answer: Omit<
    GraphAnswer,
    "totalCount" | "truncated" | "budget" | "tokenEstimate"
  >,
  budget: number,
): GraphAnswer {
  const totalCount = answer.nodes.length + answer.edges.length;
  let nodes = [...answer.nodes];
  let edges = [...answer.edges];
  const build = (): GraphAnswer => ({
    ...answer,
    nodes,
    edges,
    totalCount,
    truncated: nodes.length + edges.length < totalCount,
    budget,
    tokenEstimate: 0,
  });
  let current = build();
  while (estimate(current) > budget && (edges.length > 0 || nodes.length > 1)) {
    if (edges.length > 0) {
      edges = edges.slice(0, Math.floor(edges.length * 0.75));
    } else {
      nodes = nodes.slice(0, Math.max(1, Math.floor(nodes.length * 0.75)));
    }
    current = build();
  }
  return { ...current, tokenEstimate: estimate(current) };
}
