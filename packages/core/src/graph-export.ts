/**
 * `workspace.exportGraph()` (M-096, ADR-0062): the data behind `graph.json`.
 * Built only from measured edges (imports, test reach, declarations, ADR
 * mentions).
 */

import { basename } from "node:path";
import {
  GRAPH_EXPORT_VERSION,
  type GraphExport,
  type GraphExportEdge,
  type GraphExportNode,
  type PrismError,
  type Result,
  isTestPath,
  ok,
} from "@repo-prism/shared";
import type { GraphReads } from "./graph-reads.js";

const FILE = "file:";

export type GraphExportResult = {
  readonly graph: GraphExport;
};

function packageOf(
  path: string,
  roots: readonly { id: string; rootDir: string }[],
): string {
  let best: { id: string; rootDir: string } | undefined;
  for (const root of roots) {
    const dir = root.rootDir.replace(/^\.\/?/, "").replace(/\/+$/, "");
    if (dir === "" || path === dir || path.startsWith(`${dir}/`)) {
      if (!best || dir.length > best.rootDir.length)
        best = { id: root.id, rootDir: dir };
    }
  }
  return best?.id ?? "root";
}

export async function exportWorkspaceGraph(
  workspace: GraphReads,
  now: Date = new Date(),
): Promise<Result<GraphExportResult, PrismError>> {
  const index = workspace.getIndex();
  if (!index.ok) return index;
  const deps = workspace.getDependencyGraph();
  if (!deps.ok) return deps;
  const listed = await workspace.listPackages();
  const roots = listed.ok
    ? listed.value.map((p) => ({ id: p.id, rootDir: p.rootDir }))
    : [];
  const repository = basename(workspace.rootPath);

  const nodes: GraphExportNode[] = [];
  const edges: GraphExportEdge[] = [];
  const packages = new Set<string>();
  const files = index.value.files.filter((f) => f.status === "analyzed");
  let symbolCount = 0;
  let testCount = 0;

  for (const file of files) {
    const pkg = packageOf(file.path, roots);
    const test = isTestPath(file.path);
    if (test) testCount += 1;
    if (!packages.has(pkg)) {
      packages.add(pkg);
      nodes.push({ id: `package:${pkg}`, kind: "package", label: pkg });
    }
    nodes.push({
      id: `${FILE}${file.path}`,
      kind: test ? "test" : "file",
      label: basename(file.path),
      path: file.path,
      package: pkg,
    });
    edges.push({
      kind: "contains",
      from: `package:${pkg}`,
      to: `${FILE}${file.path}`,
      provenance: "measured",
    });
    if (test) continue;
    for (const symbol of file.symbols) {
      if (!symbol.exported) continue;
      symbolCount += 1;
      const id = `symbol:${file.path}#${symbol.name}`;
      nodes.push({
        id,
        kind: "symbol",
        label: symbol.name,
        path: file.path,
        package: pkg,
      });
      edges.push({
        kind: "declares",
        from: `${FILE}${file.path}`,
        to: id,
        provenance: "measured",
      });
    }
  }

  const importsOut = new Map<string, Set<string>>();
  const importsIn = new Map<string, Set<string>>();
  for (const edge of deps.value.edges) {
    if (!edge.from.startsWith(FILE) || !edge.to.startsWith(FILE)) continue;
    const from = edge.from.slice(FILE.length);
    const to = edge.to.slice(FILE.length);
    const test = isTestPath(from);
    edges.push({
      kind: test ? "tests" : "imports",
      from: edge.from,
      to: edge.to,
      provenance: "measured",
    });
    if (test || isTestPath(to)) continue;
    importsOut.set(from, (importsOut.get(from) ?? new Set()).add(to));
    importsIn.set(to, (importsIn.get(to) ?? new Set()).add(from));
  }

  const kg = workspace.getKnowledgeGraph();
  if (kg.ok) {
    const adrs = new Set<string>();
    for (const node of kg.value.graph.nodes) {
      if (node.kind !== "adr") continue;
      adrs.add(node.id);
      nodes.push({ id: node.id, kind: "adr", label: node.label ?? node.id });
    }
    for (const edge of kg.value.graph.edges) {
      if (edge.kind !== "rationale_for" || !adrs.has(edge.from)) continue;
      edges.push({
        kind: "rationale_for",
        from: edge.from,
        to: edge.to,
        provenance: edge.provenance ?? "heuristic",
      });
    }
  }

  return ok({
    graph: {
      version: GRAPH_EXPORT_VERSION,
      generatedAt: now.toISOString(),
      indexedAt: index.value.indexedAt,
      repository,
      nodes,
      edges,
      stats: {
        packages: packages.size,
        files: files.length - testCount,
        tests: testCount,
        symbols: symbolCount,
        edges: edges.length,
      },
    },
  });
}
