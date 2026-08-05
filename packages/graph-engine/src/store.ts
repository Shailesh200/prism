import createGraph, { type Graph, type Link } from "ngraph.graph";
import { aStar } from "ngraph.path";
import {
  GraphSnapshotDtoSchema,
  PrismErrorCode,
  type GraphEdgeDto,
  type GraphNodeDto,
  type GraphSnapshotDto,
  type PrismError,
  type Result,
  err,
  ok,
  parseDto,
  prismError,
  unsafeEdgeId,
  unsafeNodeId,
} from "@repo-prism/shared";

type NodeData = {
  kind: string;
  label: string;
  attrs?: Record<string, unknown>;
};

type LinkData = {
  edgeId: string;
  kind: string;
  attrs?: Record<string, unknown>;
};

export type NeighborOptions = {
  readonly direction?: "in" | "out" | "both";
  readonly kind?: string;
};

export type GraphStore = {
  readonly id: string;
  clear(): void;
  nodeCount(): number;
  edgeCount(): number;
  addNode(node: GraphNodeDto): Result<true, PrismError>;
  removeNode(id: string): Result<true, PrismError>;
  addEdge(edge: GraphEdgeDto): Result<true, PrismError>;
  removeEdge(id: string): Result<true, PrismError>;
  getNode(id: string): GraphNodeDto | undefined;
  getEdge(id: string): GraphEdgeDto | undefined;
  bulkLoad(snapshot: GraphSnapshotDto): Result<true, PrismError>;
  neighbors(id: string, opts?: NeighborOptions): string[];
  degree(id: string, opts?: NeighborOptions): number;
  subgraph(ids: readonly string[]): GraphSnapshotDto;
  shortestPath(from: string, to: string): Result<string[], PrismError>;
  toJSON(): GraphSnapshotDto;
};

function graphError(message: string, details?: unknown): PrismError {
  return prismError(PrismErrorCode.GRAPH_ERROR, message, details);
}

function toNodeDto(id: string, data: NodeData): GraphNodeDto {
  return {
    id: unsafeNodeId(id),
    kind: data.kind,
    label: data.label,
    ...(data.attrs === undefined
      ? {}
      : { attrs: data.attrs as GraphNodeDto["attrs"] }),
  };
}

function toEdgeDto(link: Link<LinkData>): GraphEdgeDto {
  return {
    id: unsafeEdgeId(link.data.edgeId),
    kind: link.data.kind,
    from: unsafeNodeId(String(link.fromId)),
    to: unsafeNodeId(String(link.toId)),
    ...(link.data.attrs === undefined
      ? {}
      : { attrs: link.data.attrs as GraphEdgeDto["attrs"] }),
  };
}

function linkMatches(
  link: Link<LinkData>,
  nodeId: string,
  direction: NeighborOptions["direction"],
  kind: string | undefined,
): boolean {
  if (kind !== undefined && link.data.kind !== kind) return false;
  const from = String(link.fromId);
  const to = String(link.toId);
  if (direction === "out") return from === nodeId;
  if (direction === "in") return to === nodeId;
  return from === nodeId || to === nodeId;
}

function otherEnd(link: Link<LinkData>, nodeId: string): string {
  return String(link.fromId) === nodeId
    ? String(link.toId)
    : String(link.fromId);
}

/** Create an empty ngraph-backed typed graph store. */
export function createGraphStore(
  options: { readonly id?: string } = {},
): GraphStore {
  const id = options.id ?? "graph";
  let g: Graph<NodeData, LinkData> = createGraph({ multigraph: true });
  const edgesById = new Map<string, Link<LinkData>>();

  const reset = (next: Graph<NodeData, LinkData>) => {
    g = next;
    edgesById.clear();
    g.forEachLink((link) => {
      edgesById.set(link.data.edgeId, link);
    });
  };

  const store: GraphStore = {
    id,
    clear() {
      g.clear();
      edgesById.clear();
    },
    nodeCount() {
      return g.getNodesCount();
    },
    edgeCount() {
      return g.getLinksCount();
    },
    addNode(node) {
      if (!node.id.trim()) {
        return err(graphError("Node id must be non-empty"));
      }
      g.addNode(node.id, {
        kind: node.kind,
        label: node.label,
        ...(node.attrs === undefined ? {} : { attrs: node.attrs }),
      });
      return ok(true);
    },
    removeNode(nodeId) {
      if (!g.hasNode(nodeId)) {
        return err(graphError(`Node not found: ${nodeId}`, { nodeId }));
      }
      const links = g.getLinks(nodeId);
      if (links) {
        for (const link of links) {
          edgesById.delete(link.data.edgeId);
        }
      }
      g.removeNode(nodeId);
      return ok(true);
    },
    addEdge(edge) {
      if (!edge.id.trim()) {
        return err(graphError("Edge id must be non-empty"));
      }
      if (edgesById.has(edge.id)) {
        return err(
          graphError(`Edge id already exists: ${edge.id}`, { edgeId: edge.id }),
        );
      }
      if (!g.hasNode(edge.from)) {
        return err(
          graphError(`Edge from-node missing: ${edge.from}`, {
            from: edge.from,
          }),
        );
      }
      if (!g.hasNode(edge.to)) {
        return err(
          graphError(`Edge to-node missing: ${edge.to}`, { to: edge.to }),
        );
      }
      const link = g.addLink(edge.from, edge.to, {
        edgeId: edge.id,
        kind: edge.kind,
        ...(edge.attrs === undefined ? {} : { attrs: edge.attrs }),
      });
      edgesById.set(edge.id, link);
      return ok(true);
    },
    removeEdge(edgeId) {
      const link = edgesById.get(edgeId);
      if (!link) {
        return err(graphError(`Edge not found: ${edgeId}`, { edgeId }));
      }
      g.removeLink(link);
      edgesById.delete(edgeId);
      return ok(true);
    },
    getNode(nodeId) {
      const node = g.getNode(nodeId);
      if (!node) return undefined;
      return toNodeDto(String(node.id), node.data);
    },
    getEdge(edgeId) {
      const link = edgesById.get(edgeId);
      if (!link) return undefined;
      return toEdgeDto(link);
    },
    bulkLoad(snapshot) {
      const parsed = parseDto(GraphSnapshotDtoSchema, snapshot);
      if (!parsed.ok) {
        return err(graphError(`Invalid graph snapshot: ${parsed.message}`));
      }
      const nodeIds = new Set(parsed.value.nodes.map((n) => n.id));
      for (const edge of parsed.value.edges) {
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
          return err(
            graphError("bulkLoad edge references missing node", {
              edgeId: edge.id,
              from: edge.from,
              to: edge.to,
            }),
          );
        }
      }
      const edgeIds = new Set<string>();
      for (const edge of parsed.value.edges) {
        if (edgeIds.has(edge.id)) {
          return err(
            graphError(`bulkLoad duplicate edge id: ${edge.id}`, {
              edgeId: edge.id,
            }),
          );
        }
        edgeIds.add(edge.id);
      }

      const next = createGraph<NodeData, LinkData>({ multigraph: true });
      next.beginUpdate();
      for (const node of parsed.value.nodes) {
        next.addNode(node.id, {
          kind: node.kind,
          label: node.label,
          ...(node.attrs === undefined ? {} : { attrs: node.attrs }),
        });
      }
      for (const edge of parsed.value.edges) {
        next.addLink(edge.from, edge.to, {
          edgeId: edge.id,
          kind: edge.kind,
          ...(edge.attrs === undefined ? {} : { attrs: edge.attrs }),
        });
      }
      next.endUpdate();
      reset(next);
      return ok(true);
    },
    neighbors(nodeId, opts = {}) {
      if (!g.hasNode(nodeId)) return [];
      const direction = opts.direction ?? "both";
      const out = new Set<string>();
      const links = g.getLinks(nodeId);
      if (!links) return [];
      for (const link of links) {
        if (!linkMatches(link, nodeId, direction, opts.kind)) continue;
        out.add(otherEnd(link, nodeId));
      }
      return [...out].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    },
    degree(nodeId, opts = {}) {
      if (!g.hasNode(nodeId)) return 0;
      const direction = opts.direction ?? "both";
      const links = g.getLinks(nodeId);
      if (!links) return 0;
      let count = 0;
      for (const link of links) {
        if (linkMatches(link, nodeId, direction, opts.kind)) count += 1;
      }
      return count;
    },
    subgraph(ids) {
      const want = new Set(ids);
      const nodes: GraphNodeDto[] = [];
      const edges: GraphEdgeDto[] = [];
      g.forEachNode((node) => {
        const nid = String(node.id);
        if (!want.has(nid)) return;
        nodes.push(toNodeDto(nid, node.data));
      });
      g.forEachLink((link) => {
        const from = String(link.fromId);
        const to = String(link.toId);
        if (want.has(from) && want.has(to)) {
          edges.push(toEdgeDto(link));
        }
      });
      nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return { id: `${id}:subgraph`, nodes, edges };
    },
    shortestPath(from, to) {
      if (!g.hasNode(from)) {
        return err(graphError(`Path from-node missing: ${from}`, { from }));
      }
      if (!g.hasNode(to)) {
        return err(graphError(`Path to-node missing: ${to}`, { to }));
      }
      if (from === to) return ok([from]);
      const finder = aStar(g, { oriented: true });
      const found = finder.find(from, to);
      if (found.length === 0) {
        return err(graphError(`No path from ${from} to ${to}`, { from, to }));
      }
      // ngraph.path returns nodes from target → source; reverse for from → to.
      const path = found.map((n) => String(n.id)).reverse();
      return ok(path);
    },
    toJSON() {
      const nodes: GraphNodeDto[] = [];
      const edges: GraphEdgeDto[] = [];
      g.forEachNode((node) => {
        nodes.push(toNodeDto(String(node.id), node.data));
      });
      g.forEachLink((link) => {
        edges.push(toEdgeDto(link));
      });
      nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return { id, nodes, edges };
    },
  };

  return store;
}

/** Parse JSON into a new store (deterministic round-trip helper). */
export function graphStoreFromJSON(
  data: unknown,
): Result<GraphStore, PrismError> {
  const parsed = parseDto(GraphSnapshotDtoSchema, data);
  if (!parsed.ok) {
    return err(graphError(`Invalid graph JSON: ${parsed.message}`));
  }
  const store = createGraphStore({ id: parsed.value.id });
  const loaded = store.bulkLoad(parsed.value);
  if (!loaded.ok) return loaded;
  return ok(store);
}
