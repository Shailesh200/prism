import type {
  GraphSnapshotDto,
  NavigationRoute,
  NavigationRouteResult,
} from "@prism/shared";

export type FindPathsOptions = {
  /** Number of simple paths to return (default 1 = shortest only). */
  readonly maxAlternatives?: number;
  /** Cap hop count (edges); default 32. */
  readonly maxHops?: number;
  readonly kind?: NavigationRoute["kind"];
};

function buildAdj(graph: GraphSnapshotDto): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue;
    const list = adj.get(e.from)!;
    if (!list.includes(e.to)) list.push(e.to);
  }
  for (const list of adj.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }
  return adj;
}

function toRoute(
  hops: readonly string[],
  kind: NavigationRoute["kind"],
): NavigationRoute {
  return {
    from: hops[0]!,
    to: hops[hops.length - 1]!,
    hops: [...hops],
    length: Math.max(0, hops.length - 1),
    kind,
  };
}

/** BFS shortest path (node ids). */
export function shortestPath(
  graph: GraphSnapshotDto,
  from: string,
  to: string,
  maxHops = 32,
): string[] | null {
  if (!graph.nodes.some((n) => n.id === from)) return null;
  if (!graph.nodes.some((n) => n.id === to)) return null;
  if (from === to) return [from];

  const adj = buildAdj(graph);
  const prev = new Map<string, string | null>();
  const dist = new Map<string, number>();
  const queue: string[] = [from];
  prev.set(from, null);
  dist.set(from, 0);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    if (d >= maxHops) continue;
    for (const next of adj.get(cur) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      dist.set(next, d + 1);
      if (next === to) {
        const hops: string[] = [];
        let walk: string | null = to;
        while (walk !== null) {
          hops.push(walk);
          walk = prev.get(walk) ?? null;
        }
        hops.reverse();
        return hops;
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * Up to `maxAlternatives` simple paths, shortest-first (DFS with hop bound).
 */
export function findPaths(
  graph: GraphSnapshotDto,
  from: string,
  to: string,
  options: FindPathsOptions = {},
): NavigationRouteResult {
  const maxAlternatives = Math.max(1, options.maxAlternatives ?? 1);
  const maxHops = options.maxHops ?? 32;
  const kind = options.kind ?? "dependency";

  if (
    !graph.nodes.some((n) => n.id === from) ||
    !graph.nodes.some((n) => n.id === to)
  ) {
    return { routes: [], empty: true };
  }

  const first = shortestPath(graph, from, to, maxHops);
  if (!first) {
    return { routes: [], empty: true };
  }

  const routes: NavigationRoute[] = [toRoute(first, kind)];
  if (maxAlternatives === 1) {
    return { routes, empty: false };
  }

  const adj = buildAdj(graph);
  const found = new Set<string>([first.join("\0")]);

  const dfs = (path: string[]): void => {
    if (routes.length >= maxAlternatives) return;
    const cur = path[path.length - 1]!;
    if (path.length - 1 > maxHops) return;
    if (cur === to && path.length > 1) {
      const key = path.join("\0");
      if (!found.has(key)) {
        found.add(key);
        routes.push(toRoute(path, kind));
      }
      return;
    }
    for (const next of adj.get(cur) ?? []) {
      if (path.includes(next)) continue;
      dfs([...path, next]);
      if (routes.length >= maxAlternatives) return;
    }
  };

  dfs([from]);
  routes.sort((a, b) => {
    const d = a.length - b.length;
    return d !== 0 ? d : a.hops.join("\0").localeCompare(b.hops.join("\0"));
  });

  return {
    routes: routes.slice(0, maxAlternatives),
    empty: routes.length === 0,
  };
}

export function fileNodeId(path: string): string {
  return `file:${path}`;
}
