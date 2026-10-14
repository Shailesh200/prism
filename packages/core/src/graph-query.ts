/**
 * `workspace.graph()` (M-096, ADR-0062): one structural question, one bounded
 * answer. Composed from reads Core already has, so it adds no second graph:
 * the dependency graph for imports, the knowledge graph for symbols and
 * references, navigation for routes, impact for test reach.
 */

import {
  type GraphAnswer,
  type GraphEdge,
  type GraphEndpoint,
  type GraphNode,
  type GraphProvenance,
  type GraphQuery,
  PrismErrorCode,
  type PrismError,
  type Result,
  clampGraphBudget,
  err,
  fitGraphAnswer,
  ok,
  prismError,
} from "@repo-prism/shared";
import type { GraphReads } from "./graph-reads.js";

const FILE = "file:";

type Draft = Omit<
  GraphAnswer,
  "totalCount" | "truncated" | "budget" | "tokenEstimate"
>;

function referenceProvenance(
  confidence: "high" | "medium" | "low" | undefined,
): GraphProvenance {
  if (confidence === "low") return "inferred";
  if (confidence === "medium") return "heuristic";
  return "measured";
}

function fileEdges(
  workspace: GraphReads,
): Result<
  { out: Map<string, string[]>; in: Map<string, string[]> },
  PrismError
> {
  const graph = workspace.getDependencyGraph();
  if (!graph.ok) return graph;
  const out = new Map<string, string[]>();
  const into = new Map<string, string[]>();
  for (const edge of graph.value.edges) {
    if (!edge.from.startsWith(FILE) || !edge.to.startsWith(FILE)) continue;
    const from = edge.from.slice(FILE.length);
    const to = edge.to.slice(FILE.length);
    out.set(from, [...(out.get(from) ?? []), to]);
    into.set(to, [...(into.get(to) ?? []), from]);
  }
  return ok({ out, in: into });
}

function isKnownFile(workspace: GraphReads, path: string): boolean {
  const index = workspace.getIndex();
  return index.ok && index.value.files.some((file) => file.path === path);
}

/** A symbol endpoint resolves to one declaration, or comes back as candidates. */
function resolveSymbol(
  workspace: GraphReads,
  endpoint: GraphEndpoint,
): Result<
  | {
      readonly kind: "one";
      readonly path: string;
      readonly name: string;
      readonly symbolKind: string;
      readonly start: number;
    }
  | { readonly kind: "many"; readonly nodes: GraphNode[] },
  PrismError
> {
  const name = endpoint.symbol ?? "";
  const found = workspace.findSymbol({
    name,
    ...(endpoint.path ? { path: endpoint.path } : {}),
  });
  if (!found.ok) return found;
  const declared = found.value.filter((hit) => hit.kind !== "export");
  const hits = declared.length > 0 ? declared : found.value;
  if (hits.length === 0) {
    return err(
      prismError(
        PrismErrorCode.NOT_FOUND,
        `No symbol named ${name} in the index`,
      ),
    );
  }
  const files = new Set(hits.map((hit) => hit.path));
  if (files.size > 1) {
    return ok({
      kind: "many",
      nodes: hits.map((hit) => ({
        kind: "symbol" as const,
        path: hit.path,
        name: hit.name,
        symbolKind: hit.kind,
      })),
    });
  }
  const hit = hits[0]!;
  return ok({
    kind: "one",
    path: hit.path,
    name: hit.name,
    symbolKind: hit.kind,
    start: hit.start,
  });
}

async function find(
  workspace: GraphReads,
  query: Extract<GraphQuery, { mode: "find" }>,
): Promise<Result<Draft, PrismError>> {
  const exact = workspace.findSymbol({
    name: query.name,
    ...(query.kind ? { kind: query.kind } : {}),
  });
  if (!exact.ok) return exact;
  let symbols = exact.value;
  if (symbols.length === 0) {
    const fuzzy = workspace.searchSymbols({
      pattern: query.name,
      ...(query.kind ? { kind: query.kind } : {}),
    });
    if (!fuzzy.ok) return fuzzy;
    symbols = [...fuzzy.value.items];
  }
  const index = workspace.getIndex();
  if (!index.ok) return index;
  const needle = query.name.toLowerCase();
  const files = index.value.files
    .filter((file) => file.path.toLowerCase().includes(needle))
    .map((file) => file.path);
  const nodes: GraphNode[] = [
    ...symbols.map((hit) => ({
      kind: "symbol" as const,
      path: hit.path,
      name: hit.name,
      symbolKind: hit.kind,
    })),
    ...files.map((path) => ({ kind: "file" as const, path })),
  ];
  const declaringFiles = new Set(
    symbols.filter((hit) => hit.kind !== "export").map((hit) => hit.path),
  );
  return ok({
    mode: "find",
    nodes,
    edges: [],
    ...(declaringFiles.size > 1 && exact.value.length > 0
      ? { ambiguous: true }
      : {}),
    ...(nodes.length === 0
      ? { note: `Nothing named or pathed like "${query.name}" is indexed.` }
      : {}),
  });
}

async function testsOf(
  workspace: GraphReads,
  path: string,
): Promise<Result<GraphEdge[], PrismError>> {
  const impact = await workspace.testImpact({ kind: "file", id: path });
  if (!impact.ok) return impact;
  return ok(
    impact.value.tests.map((test) => ({
      kind: "tests" as const,
      from: test.path,
      to: path,
      provenance: "measured" as const,
    })),
  );
}

async function neighbors(
  workspace: GraphReads,
  query: Extract<GraphQuery, { mode: "neighbors" }>,
): Promise<Result<Draft, PrismError>> {
  const direction = query.direction ?? "both";
  const target = query.target;

  if (target.symbol) {
    const resolved = resolveSymbol(workspace, target);
    if (!resolved.ok) return resolved;
    if (resolved.value.kind === "many") {
      return ok({
        mode: "neighbors",
        nodes: resolved.value.nodes,
        edges: [],
        ambiguous: true,
        note: "Several declarations share this name. Ask again with target.path.",
      });
    }
    const symbol = resolved.value;
    const id = `${symbol.path}#${symbol.name}`;
    const edges: GraphEdge[] = [
      {
        kind: "declared_in",
        from: id,
        to: symbol.path,
        provenance: "measured",
      },
    ];
    if (direction !== "out") {
      const refs = workspace.findReferences({
        name: symbol.name,
        path: symbol.path,
        start: symbol.start,
      });
      if (!refs.ok) return refs;
      for (const ref of refs.value.references) {
        edges.push({
          kind: "references",
          from: ref.path,
          to: id,
          provenance: referenceProvenance(ref.confidence),
        });
      }
    }
    return ok({
      mode: "neighbors",
      nodes: [
        {
          kind: "symbol",
          path: symbol.path,
          name: symbol.name,
          symbolKind: symbol.symbolKind,
        },
      ],
      edges,
    });
  }

  const path = target.path ?? "";
  if (!isKnownFile(workspace, path)) {
    return err(
      prismError(PrismErrorCode.NOT_FOUND, `${path} is not in the index`),
    );
  }
  const graph = fileEdges(workspace);
  if (!graph.ok) return graph;
  const edges: GraphEdge[] = [];
  if (direction !== "in") {
    for (const to of graph.value.out.get(path) ?? []) {
      edges.push({ kind: "imports", from: path, to, provenance: "measured" });
    }
  }
  if (direction !== "out") {
    for (const from of graph.value.in.get(path) ?? []) {
      edges.push({
        kind: "imported_by",
        from,
        to: path,
        provenance: "measured",
      });
    }
    const tests = await testsOf(workspace, path);
    if (tests.ok) edges.push(...tests.value);
  }
  return ok({
    mode: "neighbors",
    nodes: [{ kind: "file", path }],
    edges,
    ...(edges.length === 0
      ? { note: "No measured imports, importers or tests for this file." }
      : {}),
  });
}

function routeEndpoint(
  workspace: GraphReads,
  endpoint: GraphEndpoint,
): Result<
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "symbol"; readonly name: string; readonly path?: string },
  PrismError
> {
  if (endpoint.symbol) {
    return ok({
      kind: "symbol",
      name: endpoint.symbol,
      ...(endpoint.path ? { path: endpoint.path } : {}),
    });
  }
  if (!endpoint.path) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        "An endpoint needs a path or a symbol",
      ),
    );
  }
  if (!isKnownFile(workspace, endpoint.path)) {
    return err(
      prismError(
        PrismErrorCode.NOT_FOUND,
        `${endpoint.path} is not in the index`,
      ),
    );
  }
  return ok({ kind: "file", path: endpoint.path });
}

async function path(
  workspace: GraphReads,
  query: Extract<GraphQuery, { mode: "path" }>,
): Promise<Result<Draft, PrismError>> {
  const from = routeEndpoint(workspace, query.from);
  if (!from.ok) return from;
  const to = routeEndpoint(workspace, query.to);
  if (!to.ok) return to;
  const routes = workspace.findRoute({
    from: from.value,
    to: to.value,
    maxAlternatives: query.maxAlternatives ?? 3,
    ...(query.maxHops !== undefined ? { maxHops: query.maxHops } : {}),
  });
  if (!routes.ok) return routes;
  const strip = (id: string) =>
    id.startsWith(FILE) ? id.slice(FILE.length) : id;
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  for (const route of routes.value.routes) {
    const hops = route.hops.map(strip);
    for (const hop of hops) nodes.set(hop, { kind: "file", path: hop });
    for (let i = 0; i + 1 < hops.length; i += 1) {
      edges.push({
        kind: "imports",
        from: hops[i]!,
        to: hops[i + 1]!,
        provenance: "measured",
      });
    }
  }
  return ok({
    mode: "path",
    nodes: [...nodes.values()],
    edges,
    routes: routes.value.routes,
    ...(routes.value.routes.length === 0
      ? {
          note: "No import path connects these. That is an answer, not an error.",
        }
      : {}),
  });
}

async function explain(
  workspace: GraphReads,
  query: Extract<GraphQuery, { mode: "explain" }>,
): Promise<Result<Draft, PrismError>> {
  const summary = await workspace.explainArea(query.path);
  if (!summary.ok) return summary;
  const edges: GraphEdge[] = [];
  if (isKnownFile(workspace, query.path)) {
    const tests = await testsOf(workspace, query.path);
    if (tests.ok) edges.push(...tests.value);
  }
  return ok({
    mode: "explain",
    nodes: [{ kind: "file", path: query.path }],
    edges,
    explain: summary.value,
  });
}

async function filter(
  workspace: GraphReads,
  query: Extract<GraphQuery, { mode: "query" }>,
): Promise<Result<Draft, PrismError>> {
  if (query.filter === "tests_reaching") {
    const tests = await testsOf(workspace, query.target);
    if (!tests.ok) return tests;
    return ok({
      mode: "query",
      nodes: tests.value.map((edge) => ({
        kind: "test" as const,
        path: edge.from,
      })),
      edges: tests.value,
    });
  }
  const graph = fileEdges(workspace);
  if (!graph.ok) return graph;
  if (query.filter === "importers_of" || query.filter === "imports_of") {
    const inbound = query.filter === "importers_of";
    const rows =
      (inbound ? graph.value.in : graph.value.out).get(query.target) ?? [];
    return ok({
      mode: "query",
      nodes: rows.map((path) => ({ kind: "file" as const, path })),
      edges: rows.map((other) => ({
        kind: inbound ? ("imported_by" as const) : ("imports" as const),
        from: inbound ? other : query.target,
        to: inbound ? query.target : other,
        provenance: "measured" as const,
      })),
    });
  }
  const within = (query.within ?? "").replace(/\/+$/, "");
  const prefix = within ? `${within}/` : "";
  const importers = (graph.value.in.get(query.target) ?? []).filter((path) =>
    path.startsWith(prefix),
  );
  return ok({
    mode: "query",
    nodes: importers.map((path) => ({ kind: "file" as const, path })),
    edges: importers.map((from) => ({
      kind: "imports" as const,
      from,
      to: query.target,
      provenance: "measured" as const,
    })),
  });
}

export async function runGraphQuery(
  workspace: GraphReads,
  query: GraphQuery,
  budget?: number,
): Promise<Result<GraphAnswer, PrismError>> {
  const run =
    query.mode === "find"
      ? find(workspace, query)
      : query.mode === "neighbors"
        ? neighbors(workspace, query)
        : query.mode === "path"
          ? path(workspace, query)
          : query.mode === "explain"
            ? explain(workspace, query)
            : filter(workspace, query);
  const draft = await run;
  if (!draft.ok) return draft;
  return ok(fitGraphAnswer(draft.value, clampGraphBudget(budget)));
}
