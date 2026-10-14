/**
 * Graph and navigation tools (M-027 / M-058): dependencies, symbols, features
 * and the routes between them.
 *
 * These are the tools that can return the most data, so every one of them is
 * bounded and every description says when the cheaper alternative is better.
 */

import { PrismErrorCode, err, ok, prismError } from "@repo-prism/shared";
import { z } from "zod";
import {
  boundGraph,
  boundList,
  limitInput,
  topDegreeNodes,
} from "../limits.js";
import { toWorkspaceRelative } from "../paths.js";
import { defineTool } from "../tool-registry.js";

const packageAggregation = z
  .boolean()
  .optional()
  .describe(
    "Aggregate file nodes into package nodes. Much smaller output on a monorepo; prefer it unless you need file-level detail.",
  );

const summaryOnly = z
  .boolean()
  .optional()
  .describe(
    "When true, return counts plus top-degree nodes only (no full edge list). Prefer this for orientation.",
  );

export const dependencyGraph = defineTool({
  name: "dependency_graph",
  title: "Dependency graph",
  description:
    "The import/re-export dependency graph, at file level or aggregated to packages. Includes unresolvedImports { count, sample } for specs that did not resolve into the graph. Bounded by default (limit 50 nodes); use summaryOnly for counts + top-degree nodes. Prefer packageAggregation, or use blast_radius if your question is about one file rather than the whole graph.",
  inputSchema: {
    packageAggregation,
    resolveAliases: z
      .boolean()
      .optional()
      .describe("Resolve tsconfig paths and package imports (default true)."),
    limit: limitInput,
    summaryOnly,
  },
  async call({ workspace }, args) {
    const result = workspace.getDependencyGraph({
      ...(args.packageAggregation === undefined
        ? {}
        : { packageAggregation: args.packageAggregation }),
      ...(args.resolveAliases === undefined
        ? {}
        : { resolveAliases: args.resolveAliases }),
    });
    if (!result.ok) return result;
    const graph = result.value;
    if (args.summaryOnly) {
      const top = topDegreeNodes(graph, args.limit);
      return ok({
        ...top,
        summaryOnly: true as const,
        id: graph.id,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        ...(graph.unresolvedImports
          ? { unresolvedImports: graph.unresolvedImports }
          : {}),
      });
    }
    const bounded = boundGraph(graph.nodes, graph.edges, args.limit);
    return ok({
      items: bounded.items,
      totalCount: bounded.totalCount,
      truncated: bounded.truncated,
      limit: bounded.limit,
      summaryOnly: false as const,
      id: graph.id,
      edges: bounded.edges,
      ...(graph.unresolvedImports
        ? { unresolvedImports: graph.unresolvedImports }
        : {}),
    });
  },
});

export const dependencyCycles = defineTool({
  name: "dependency_cycles",
  title: "Dependency cycles",
  description:
    "Import and re-export cycles, each returned as the list of files forming the loop. Use when investigating build order, flaky module initialisation, or before extracting a package.",
  inputSchema: { packageAggregation, limit: limitInput },
  async call({ workspace }, args) {
    const result = workspace.getCycles(
      args.packageAggregation === undefined
        ? undefined
        : { packageAggregation: args.packageAggregation },
    );
    if (!result.ok) return result;
    return { ok: true as const, value: boundList(result.value, args.limit) };
  },
});

export const knowledgeGraph = defineTool({
  name: "knowledge_graph",
  title: "Knowledge graph",
  description:
    "The symbol-level graph — declarations and the references between them — with summary stats. Requires path (scope to one file) or limit (bound nodes). Very large on a big repository. If you are looking for one symbol use graph (mode find), and for its callers graph (mode neighbors, direction in).",
  inputSchema: {
    path: z
      .string()
      .min(1)
      .optional()
      .describe("Workspace-relative file to scope the graph to."),
    limit: limitInput,
  },
  async call({ workspace, workspaceRoot }, args) {
    if (args.path === undefined && args.limit === undefined) {
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          "knowledge_graph requires `path` or `limit` (unbounded dumps are locked)",
        ),
      );
    }

    let scopedPath: string | undefined;
    if (args.path !== undefined) {
      const relative = toWorkspaceRelative(workspaceRoot, args.path);
      if (!relative.ok) return relative;
      scopedPath = relative.value;
    }

    const result = workspace.getKnowledgeGraph();
    if (!result.ok) return result;
    const { graph, stats } = result.value;

    let nodes = graph.nodes;
    if (scopedPath !== undefined) {
      const fileId = `file:${scopedPath}`;
      nodes = graph.nodes.filter((node) => {
        if (node.id === fileId) return true;
        const attrs = node.attrs as { path?: unknown } | undefined;
        return attrs?.path === scopedPath;
      });
    }

    const bounded = boundGraph(nodes, graph.edges, args.limit);
    return ok({
      items: bounded.items,
      totalCount: bounded.totalCount,
      truncated: bounded.truncated,
      limit: bounded.limit,
      id: graph.id,
      edges: bounded.edges,
      stats,
      ...(scopedPath !== undefined ? { path: scopedPath } : {}),
    });
  },
});

export const exploreCode = defineTool({
  name: "explore_code",
  title: "Explore code",
  description:
    "Everything about one file or symbol in a single call: usages, ownership, related and similar code, and a change timeline. Usages are bounded (default 50) via a nested envelope so large files do not drown the response. Use when asked to understand a specific thing rather than the repository as a whole.",
  inputSchema: {
    kind: z.enum(["file", "symbol"]).describe("What the target is."),
    path: z
      .string()
      .min(1)
      .optional()
      .describe("Workspace-relative path. Required when kind is 'file'."),
    name: z
      .string()
      .min(1)
      .optional()
      .describe("Symbol name. Required when kind is 'symbol'."),
    start: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Declaration start offset, to disambiguate a symbol."),
    limit: limitInput,
  },
  async call({ workspace, workspaceRoot }, args) {
    const path = args.path
      ? toWorkspaceRelative(workspaceRoot, args.path)
      : undefined;
    if (path && !path.ok) return path;

    const report =
      args.kind === "file"
        ? !path?.ok
          ? err(
              prismError(
                PrismErrorCode.VALIDATION,
                "A 'file' target requires `path`",
              ),
            )
          : await workspace.exploreCode({ kind: "file", path: path.value })
        : !args.name
          ? err(
              prismError(
                PrismErrorCode.VALIDATION,
                "A 'symbol' target requires `name`",
              ),
            )
          : await workspace.exploreCode({
              kind: "symbol",
              name: args.name,
              ...(path?.ok ? { path: path.value } : {}),
              ...(args.start === undefined ? {} : { start: args.start }),
            });

    if (!report.ok) return report;
    const usages = boundList(report.value.usages, args.limit);
    return ok({
      ...report.value,
      usages: usages.items,
      usagesEnvelope: usages,
    });
  },
});

export const GRAPH_TOOLS = [
  exploreCode,
  dependencyGraph,
  dependencyCycles,
  knowledgeGraph,
];
