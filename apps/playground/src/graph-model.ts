import type {
  GraphExport,
  GraphExportEdge,
  GraphExportNode,
} from "@repo-prism/shared";

export function packageKey(node: GraphExportNode): string {
  return node.id.startsWith("package:")
    ? node.id.slice("package:".length)
    : node.id;
}

export function isFileNode(node: GraphExportNode): boolean {
  return node.kind === "file" || node.kind === "test";
}

export function fileCount(graph: GraphExport, pkg: GraphExportNode): number {
  const key = packageKey(pkg);
  let count = 0;
  for (const node of graph.nodes) {
    if (isFileNode(node) && node.package === key) count += 1;
  }
  return count;
}

export function packagesOf(graph: GraphExport): GraphExportNode[] {
  return graph.nodes
    .filter((node) => node.kind === "package")
    .slice()
    .sort(
      (a, b) =>
        fileCount(graph, b) - fileCount(graph, a) ||
        a.label.localeCompare(b.label),
    );
}

export function filesInPackage(
  graph: GraphExport,
  key: string,
): GraphExportNode[] {
  return graph.nodes
    .filter((node) => isFileNode(node) && node.package === key)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));
}

function haystack(node: GraphExportNode): string {
  return `${node.label} ${node.path ?? ""} ${node.package ?? ""}`.toLowerCase();
}

export function visiblePackages(
  graph: GraphExport,
  query: string,
): GraphExportNode[] {
  const packages = packagesOf(graph);
  const needle = query.trim().toLowerCase();
  if (!needle) return packages;
  return packages.filter((pkg) => {
    if (haystack(pkg).includes(needle)) return true;
    return filesInPackage(graph, packageKey(pkg)).some((file) =>
      haystack(file).includes(needle),
    );
  });
}

export function visibleFiles(
  graph: GraphExport,
  key: string,
  query: string,
): GraphExportNode[] {
  const files = filesInPackage(graph, key);
  const needle = query.trim().toLowerCase();
  if (!needle) return files;
  const hits = files.filter((file) => haystack(file).includes(needle));
  return hits.length > 0 ? hits : files;
}

export type GraphRelation = {
  readonly edge: GraphExportEdge;
  readonly other: GraphExportNode | undefined;
  readonly direction: "out" | "in";
};

export type GraphRelations = {
  readonly imports: readonly GraphRelation[];
  readonly importedBy: readonly GraphRelation[];
  readonly tests: readonly GraphRelation[];
  readonly files: readonly GraphRelation[];
};

export function relationsFor(graph: GraphExport, id: string): GraphRelations {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const imports: GraphRelation[] = [];
  const importedBy: GraphRelation[] = [];
  const tests: GraphRelation[] = [];
  const files: GraphRelation[] = [];
  for (const edge of graph.edges) {
    if (edge.from !== id && edge.to !== id) continue;
    const direction = edge.from === id ? "out" : "in";
    const otherId = direction === "out" ? edge.to : edge.from;
    const relation: GraphRelation = {
      edge,
      other: byId.get(otherId),
      direction,
    };
    if (edge.kind === "contains" && direction === "out") files.push(relation);
    else if (edge.kind === "imports" && direction === "out")
      imports.push(relation);
    else if (edge.kind === "imports" && direction === "in")
      importedBy.push(relation);
    else if (edge.kind === "tests") tests.push(relation);
  }
  return { imports, importedBy, tests, files };
}

export function promptFor(node: GraphExportNode): string {
  const target = node.path || node.label;
  return `In ${target}, what depends on this and what should I read first?`;
}
