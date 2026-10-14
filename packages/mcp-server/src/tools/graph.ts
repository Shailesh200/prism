import {
  GRAPH_DEFAULT_BUDGET,
  GRAPH_MAX_BUDGET,
  GRAPH_MODES,
  GRAPH_QUERY_FILTERS,
  type GraphEndpoint,
  type GraphQuery,
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@repo-prism/shared";
import { z } from "zod";
import { toWorkspaceRelative } from "../paths.js";
import { defineTool } from "../tool-registry.js";

const endpoint = z
  .object({
    path: z.string().min(1).optional().describe("Workspace-relative file."),
    symbol: z
      .string()
      .min(1)
      .optional()
      .describe("Symbol name. Add path when several files declare it."),
  })
  .describe("A file (path) or a symbol (symbol, optionally with path).");

function need(field: string, mode: string): PrismError {
  return prismError(
    PrismErrorCode.VALIDATION,
    `graph mode "${mode}" needs \`${field}\``,
  );
}

function relativeEndpoint(
  root: string,
  value: { path?: string | undefined; symbol?: string | undefined } | undefined,
  field: string,
  mode: string,
): Result<GraphEndpoint, PrismError> {
  if (!value || (!value.path && !value.symbol)) return err(need(field, mode));
  if (!value.path) return ok({ symbol: value.symbol! });
  const path = toWorkspaceRelative(root, value.path);
  if (!path.ok) return path;
  return ok({
    path: path.value,
    ...(value.symbol ? { symbol: value.symbol } : {}),
  });
}

export const graph = defineTool({
  name: "graph",
  title: "Repository graph",
  description:
    "One structural question about the repository, answered from Prism's local graph. Modes: find (a symbol or path by name; candidates when ambiguous), neighbors (imports, importers and tests of a file; declaration and references of a symbol), path (how A reaches B through imports), explain (what a file or folder is for, its owners and tests), query (filter: tests_reaching, importers_of, imports_of, files_in_importing). Every edge says measured, heuristic or inferred; open the file before relying on an inferred one. Bounded by `budget` tokens (default 1500); `truncated` says when it was cut.",
  inputSchema: {
    mode: z.enum(GRAPH_MODES).describe("What to ask."),
    name: z.string().min(1).optional().describe("find: the name to look up."),
    kind: z
      .string()
      .min(1)
      .optional()
      .describe("find: symbol kind filter, e.g. 'function'."),
    target: endpoint.optional().describe("neighbors: the file or symbol."),
    direction: z
      .enum(["in", "out", "both"])
      .optional()
      .describe("neighbors: in (who uses it), out (what it uses), both."),
    from: endpoint.optional().describe("path: the start."),
    to: endpoint.optional().describe("path: the destination."),
    maxHops: z.number().int().min(1).max(50).optional(),
    path: z
      .string()
      .min(1)
      .optional()
      .describe("explain: workspace-relative file or folder."),
    filter: z
      .enum(GRAPH_QUERY_FILTERS)
      .optional()
      .describe("query: which filter."),
    of: z
      .string()
      .min(1)
      .optional()
      .describe("query: the workspace-relative file the filter is about."),
    within: z
      .string()
      .min(1)
      .optional()
      .describe("query files_in_importing: the folder to look in."),
    budget: z
      .number()
      .int()
      .min(200)
      .max(GRAPH_MAX_BUDGET)
      .optional()
      .describe(
        `Token budget for the answer, bytes ÷ 4 (default ${GRAPH_DEFAULT_BUDGET}, max ${GRAPH_MAX_BUDGET}).`,
      ),
  },
  async call({ workspace, workspaceRoot }, args) {
    let query: GraphQuery;
    if (args.mode === "find") {
      if (!args.name) return err(need("name", args.mode));
      query = {
        mode: "find",
        name: args.name,
        ...(args.kind ? { kind: args.kind } : {}),
      };
    } else if (args.mode === "neighbors") {
      const target = relativeEndpoint(
        workspaceRoot,
        args.target,
        "target",
        args.mode,
      );
      if (!target.ok) return target;
      query = {
        mode: "neighbors",
        target: target.value,
        ...(args.direction ? { direction: args.direction } : {}),
      };
    } else if (args.mode === "path") {
      const from = relativeEndpoint(
        workspaceRoot,
        args.from,
        "from",
        args.mode,
      );
      if (!from.ok) return from;
      const to = relativeEndpoint(workspaceRoot, args.to, "to", args.mode);
      if (!to.ok) return to;
      query = {
        mode: "path",
        from: from.value,
        to: to.value,
        ...(args.maxHops !== undefined ? { maxHops: args.maxHops } : {}),
      };
    } else if (args.mode === "explain") {
      if (!args.path) return err(need("path", args.mode));
      const path = toWorkspaceRelative(workspaceRoot, args.path);
      if (!path.ok) return path;
      query = { mode: "explain", path: path.value };
    } else {
      if (!args.filter) return err(need("filter", args.mode));
      if (!args.of) return err(need("of", args.mode));
      const of = toWorkspaceRelative(workspaceRoot, args.of);
      if (!of.ok) return of;
      let within: string | undefined;
      if (args.within) {
        const rel = toWorkspaceRelative(workspaceRoot, args.within);
        if (!rel.ok) return rel;
        within = rel.value;
      }
      query = {
        mode: "query",
        filter: args.filter,
        target: of.value,
        ...(within !== undefined ? { within } : {}),
      };
    }
    return workspace.graph(query, args.budget);
  },
});
