/**
 * Graph and navigation tools (M-027): dependencies, symbols, features and the
 * routes between them.
 *
 * These are the tools that can return the most data, so every one of them is
 * bounded and every description says when the cheaper alternative is better.
 */

import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@prism/shared";
import { z } from "zod";
import { boundList, limitInput } from "../limits.js";
import { toWorkspaceRelative } from "../paths.js";
import { defineTool } from "../tool-registry.js";

const packageAggregation = z
  .boolean()
  .optional()
  .describe(
    "Aggregate file nodes into package nodes. Much smaller output on a monorepo; prefer it unless you need file-level detail.",
  );

export const dependencyGraph = defineTool({
  name: "dependency_graph",
  title: "Dependency graph",
  description:
    "The import/re-export dependency graph, at file level or aggregated to packages. Large on any real repository — prefer packageAggregation, or use blast_radius if your question is about one file rather than the whole graph.",
  inputSchema: {
    packageAggregation,
    resolveAliases: z
      .boolean()
      .optional()
      .describe("Resolve tsconfig paths and package imports (default true)."),
  },
  async call({ workspace }, args) {
    return workspace.getDependencyGraph({
      ...(args.packageAggregation === undefined
        ? {}
        : { packageAggregation: args.packageAggregation }),
      ...(args.resolveAliases === undefined
        ? {}
        : { resolveAliases: args.resolveAliases }),
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
    "The symbol-level graph — declarations and the references between them — with summary stats. Very large on a big repository. If you are looking for one symbol use find_symbol, and for its callers use find_references.",
  inputSchema: {},
  async call({ workspace }) {
    return workspace.getKnowledgeGraph();
  },
});

export const featureGraph = defineTool({
  name: "feature_graph",
  title: "Feature graph",
  description:
    "Inferred features and how they depend on each other. Features are heuristic groupings of files, not a declared structure, so treat them as a starting point rather than ground truth.",
  inputSchema: {},
  async call({ workspace }) {
    return workspace.getFeatureGraph();
  },
});

export const listFeatures = defineTool({
  name: "list_features",
  title: "List features",
  description:
    "Inferred features with their member files and a confidence score. Cheaper than feature_graph when you only need the list. Low confidence means the grouping is a guess.",
  inputSchema: { limit: limitInput },
  async call({ workspace }, args) {
    const result = workspace.listFeatures();
    if (!result.ok) return result;
    return { ok: true as const, value: boundList(result.value, args.limit) };
  },
});

export const findSymbol = defineTool({
  name: "find_symbol",
  title: "Find symbol",
  description:
    "Find indexed symbols by name, optionally narrowed by file or kind. Use to locate a definition before asking about its impact.",
  inputSchema: {
    name: z.string().min(1).describe("Symbol name to search for."),
    path: z
      .string()
      .min(1)
      .optional()
      .describe("Workspace-relative file to restrict the search to."),
    kind: z
      .string()
      .min(1)
      .optional()
      .describe("Symbol kind filter, e.g. 'function', 'class'."),
    limit: limitInput,
  },
  async call({ workspace, workspaceRoot }, args) {
    const path = args.path
      ? toWorkspaceRelative(workspaceRoot, args.path)
      : undefined;
    if (path && !path.ok) return path;

    const result = workspace.findSymbol({
      name: args.name,
      ...(path?.ok ? { path: path.value } : {}),
      ...(args.kind ? { kind: args.kind } : {}),
    });
    if (!result.ok) return result;
    return { ok: true as const, value: boundList(result.value, args.limit) };
  },
});

export const findReferences = defineTool({
  name: "find_references",
  title: "Find references",
  description:
    "Find resolved references to a symbol — who actually calls or imports it. Pass path (and start when several symbols share a name) to disambiguate. Use before renaming or deleting anything.",
  inputSchema: {
    name: z.string().min(1).describe("Symbol name."),
    path: z
      .string()
      .min(1)
      .optional()
      .describe("Workspace-relative file declaring the symbol."),
    start: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Declaration start offset, to disambiguate further."),
    limit: limitInput,
  },
  async call({ workspace, workspaceRoot }, args) {
    const path = args.path
      ? toWorkspaceRelative(workspaceRoot, args.path)
      : undefined;
    if (path && !path.ok) return path;

    const result = workspace.findReferences({
      name: args.name,
      ...(path?.ok ? { path: path.value } : {}),
      ...(args.start === undefined ? {} : { start: args.start }),
    });
    if (!result.ok) return result;
    return { ok: true as const, value: boundList(result.value, args.limit) };
  },
});

const endpoint = z.object({
  kind: z.enum(["file", "symbol"]),
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
});

export const dependencyRoute = defineTool({
  name: "dependency_route",
  title: "Dependency route",
  description:
    "Show how one file or symbol reaches another through the dependency graph, with alternative paths. Use to answer 'how is this connected to that?' — an empty result means no path exists, which is itself an answer.",
  inputSchema: {
    from: endpoint.describe("Starting point."),
    to: endpoint.describe("Destination."),
    maxAlternatives: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("How many distinct routes to return."),
    maxHops: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum route length."),
  },
  async call({ workspace, workspaceRoot }, args) {
    const from = resolveEndpoint(workspaceRoot, args.from);
    if (!from.ok) return from;
    const to = resolveEndpoint(workspaceRoot, args.to);
    if (!to.ok) return to;

    return workspace.findRoute({
      from: from.value,
      to: to.value,
      ...(args.maxAlternatives === undefined
        ? {}
        : { maxAlternatives: args.maxAlternatives }),
      ...(args.maxHops === undefined ? {} : { maxHops: args.maxHops }),
    });
  },
});

type Endpoint =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "symbol"; readonly name: string; readonly path?: string };

/**
 * The schema cannot express "path is required when kind is file" without a
 * discriminated union that reads badly as JSON Schema, so the check lands here
 * where the error message can say what was actually missing.
 */
function resolveEndpoint(
  workspaceRoot: string,
  input: {
    kind: "file" | "symbol";
    path?: string | undefined;
    name?: string | undefined;
  },
): Result<Endpoint, PrismError> {
  if (input.kind === "file") {
    if (!input.path) {
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          "A 'file' endpoint requires `path`",
        ),
      );
    }
    const relative = toWorkspaceRelative(workspaceRoot, input.path);
    if (!relative.ok) return relative;
    return ok({ kind: "file", path: relative.value });
  }

  if (!input.name) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        "A 'symbol' endpoint requires `name`",
      ),
    );
  }
  return ok({
    kind: "symbol",
    name: input.name,
    ...(input.path ? { path: input.path } : {}),
  });
}

export const GRAPH_TOOLS = [
  dependencyGraph,
  dependencyCycles,
  knowledgeGraph,
  featureGraph,
  listFeatures,
  findSymbol,
  findReferences,
  dependencyRoute,
];
