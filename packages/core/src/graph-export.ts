/**
 * `workspace.exportGraph()` (M-096, ADR-0062): the data behind `graph.json`
 * and `GRAPH_REPORT.md`. Built only from measured edges (imports, test reach,
 * declarations, ADR mentions), so the report has nothing to guess at.
 */

import { basename } from "node:path";
import {
  GRAPH_EXPORT_VERSION,
  type GraphExport,
  type GraphExportEdge,
  type GraphExportNode,
  type GraphReportData,
  type PrismError,
  type Result,
  isTestPath,
  ok,
} from "@repo-prism/shared";
import type { GraphReads } from "./graph-reads.js";

const FILE = "file:";
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

/** Last path segment without its extension(s): `../a/b.test.ts` → `b.test`. */
function stem(specifier: string): string {
  const last = specifier.replace(/\\/g, "/").split("/").pop() ?? "";
  return last.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, "");
}

export type GraphExportResult = {
  readonly graph: GraphExport;
  readonly report: GraphReportData;
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

  const sources = files
    .map((f) => f.path)
    .filter((p) => !isTestPath(p) && SOURCE.test(p) && !p.endsWith(".d.ts"));
  const degree = (p: string) => ({
    path: p,
    importedBy: importsIn.get(p)?.size ?? 0,
    imports: importsOut.get(p)?.size ?? 0,
  });
  const byInbound = sources
    .map(degree)
    .filter((row) => row.importedBy > 0)
    .sort((a, b) => b.importedBy - a.importedBy || (a.path < b.path ? -1 : 1));
  const connected = sources
    .map(degree)
    .filter((row) => row.importedBy + row.imports > 0)
    .sort(
      (a, b) =>
        b.importedBy + b.imports - (a.importedBy + a.imports) ||
        (a.path < b.path ? -1 : 1),
    )
    .slice(0, 5);

  const untestedHotspots: { path: string; importedBy: number }[] = [];
  for (const row of byInbound.slice(0, 15)) {
    if (untestedHotspots.length >= 5) break;
    const reach = await workspace.testImpact({ kind: "file", id: row.path });
    if (reach.ok && reach.value.tests.length === 0) {
      untestedHotspots.push({ path: row.path, importedBy: row.importedBy });
    }
  }

  const pairs = new Map<string, { from: string; to: string; count: number }>();
  for (const [from, targets] of importsOut) {
    const fromPackage = packageOf(from, roots);
    for (const to of targets) {
      const toPackage = packageOf(to, roots);
      if (fromPackage === toPackage) continue;
      const key = `${fromPackage}\0${toPackage}`;
      const pair = pairs.get(key);
      pairs.set(key, { from, to, count: (pair?.count ?? 0) + 1 });
    }
  }
  const loneCrossPackage = [...pairs.entries()]
    .filter(([, pair]) => pair.count === 1)
    .map(([key, pair]) => {
      const [fromPackage = "", toPackage = ""] = key.split("\0");
      return { from: pair.from, to: pair.to, fromPackage, toPackage };
    })
    .sort((a, b) => (a.from < b.from ? -1 : 1))
    .slice(0, 5);

  // Conservative on purpose: a report line must be true when someone checks it.
  // "Imports nothing" counts npm imports and re-exports. A file whose name any
  // import specifier ends with may be reached through an alias that did not
  // resolve, so it is left out; so are entry barrels and config files, which
  // are reached by tools rather than imports.
  const specifierStems = new Set<string>();
  for (const file of files) {
    for (const imp of file.imports) specifierStems.add(stem(imp.source));
    for (const exp of file.exports)
      if (exp.source) specifierStems.add(stem(exp.source));
  }
  const byPath = new Map(files.map((f) => [f.path, f]));
  const orphans = sources
    .filter((p) => {
      const file = byPath.get(p);
      if (!file || importsIn.has(p)) return false;
      if (file.imports.length > 0 || file.exports.some((e) => e.source))
        return false;
      const name = stem(p);
      return (
        name !== "index" &&
        !name.endsWith(".config") &&
        !specifierStems.has(name)
      );
    })
    .slice(0, 10);

  const cycles = workspace.getCycles();
  const plain = (id: string) =>
    id.startsWith(FILE) ? id.slice(FILE.length) : id;

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
    report: {
      repository,
      indexedAt: index.value.indexedAt,
      connected,
      cycles: cycles.ok
        ? cycles.value.slice(0, 5).map((cycle) => cycle.map(plain))
        : [],
      orphans,
      untestedHotspots,
      loneCrossPackage,
    },
  });
}
