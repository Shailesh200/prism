/**
 * Output bounds for list-returning tools (M-027).
 *
 * An agent's context window is a real constraint, and a repository with 40,000
 * symbols will happily produce a tool response nobody can afford to read. Every
 * list tool therefore truncates by default and *says so*, because a silently
 * truncated list is worse than a long one: the agent concludes the missing
 * items do not exist.
 */

import { z } from "zod";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

/**
 * The envelope every list tool returns.
 *
 * `items` are Core DTOs, untouched (ADR-0030 §6). The rest is bookkeeping the
 * transport needs and Core has no reason to carry.
 */
export type BoundedList<T> = {
  readonly items: readonly T[];
  /** How many Core actually produced, before truncation. */
  readonly totalCount: number;
  /** True when `items.length < totalCount`. */
  readonly truncated: boolean;
  /** The limit actually applied, after clamping. */
  readonly limit: number;
};

/** Shared `limit` input, described where the agent will read it. */
export const limitInput = z
  .number()
  .int()
  .optional()
  .describe(
    `Maximum items to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}). The response reports totalCount and truncated so you can tell whether you saw everything.`,
  );

/**
 * Clamp to `[1, MAX_LIMIT]`.
 *
 * Zero clamps up to one rather than down to an empty list: an agent asking for
 * zero items has made a mistake, and returning nothing would look like a real
 * answer of "there are none".
 */
export function clampLimit(requested: number | undefined): number {
  if (requested === undefined || Number.isNaN(requested)) return DEFAULT_LIMIT;
  if (requested < 1) return 1;
  if (requested > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(requested);
}

/** Apply the limit and report what was left out. */
export function boundList<T>(
  items: readonly T[],
  requested: number | undefined,
): BoundedList<T> {
  const limit = clampLimit(requested);
  return {
    items: items.slice(0, limit),
    totalCount: items.length,
    truncated: items.length > limit,
    limit,
  };
}

export type DegreeNode = {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly degree: number;
};

type GraphLike = {
  readonly nodes: readonly {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
  }[];
  readonly edges: readonly {
    readonly id: string;
    readonly kind: string;
    readonly from: string;
    readonly to: string;
  }[];
};

/** Rank nodes by undirected degree; used by graph `summaryOnly` mode (M-058). */
export function topDegreeNodes(
  graph: GraphLike,
  requested: number | undefined,
): BoundedList<DegreeNode> {
  const degree = new Map<string, number>();
  for (const node of graph.nodes) degree.set(node.id, 0);
  for (const edge of graph.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const ranked = [...graph.nodes]
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      degree: degree.get(node.id) ?? 0,
    }))
    .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
  return boundList(ranked, requested);
}

/**
 * Bound a graph to `limit` nodes (by input order) and keep only edges between
 * retained nodes. Envelope fields describe the node truncation (M-058 / P-C2).
 */
export function boundGraph<
  TNode extends { readonly id: string },
  TEdge extends {
    readonly from: string;
    readonly to: string;
  },
>(
  nodes: readonly TNode[],
  edges: readonly TEdge[],
  requested: number | undefined,
): BoundedList<TNode> & { readonly edges: readonly TEdge[] } {
  const limited = boundList(nodes, requested);
  const keep = new Set(limited.items.map((node) => node.id));
  return {
    ...limited,
    edges: edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to)),
  };
}
