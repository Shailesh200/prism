import {
  type GraphLayout,
  type GraphSnapshotDto,
  type PrismError,
  type Result,
  ok,
} from "@prism/shared";

export type LayoutOptions = {
  /** Horizontal gap between nodes in the same rank. */
  readonly nodeGapX?: number;
  /** Vertical gap between ranks. */
  readonly rankGapY?: number;
};

/**
 * Basic layered layout (no external dagre dep).
 * Ranks by BFS distance from roots (in-degree 0); stable x-order by node id.
 */
export function layoutGraph(
  snapshot: GraphSnapshotDto,
  options: LayoutOptions = {},
): Result<GraphLayout, PrismError> {
  const gapX = options.nodeGapX ?? 120;
  const gapY = options.rankGapY ?? 80;

  const nodeIds = snapshot.nodes.map((n) => n.id).sort();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodeIds) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of snapshot.edges) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)!.push(edge.to);
  }

  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const id of nodeIds) {
    if ((incoming.get(id) ?? 0) === 0) {
      queue.push(id);
      rank.set(id, 0);
    }
  }
  // Isolated cycles / leftover nodes get rank 0 then expand.
  if (queue.length === 0 && nodeIds.length > 0) {
    queue.push(nodeIds[0]!);
    rank.set(nodeIds[0]!, 0);
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head]!;
    head += 1;
    const r = rank.get(cur) ?? 0;
    for (const next of (outgoing.get(cur) ?? []).slice().sort()) {
      const nextRank = r + 1;
      if (!rank.has(next) || (rank.get(next) ?? 0) < nextRank) {
        rank.set(next, nextRank);
      }
      if (!queue.includes(next)) queue.push(next);
    }
  }

  for (const id of nodeIds) {
    if (!rank.has(id)) rank.set(id, 0);
  }

  const byRank = new Map<number, string[]>();
  for (const id of nodeIds) {
    const r = rank.get(id) ?? 0;
    const list = byRank.get(r) ?? [];
    list.push(id);
    byRank.set(r, list);
  }

  const positions: GraphLayout["positions"] = {};
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  for (const r of ranks) {
    const ids = (byRank.get(r) ?? []).slice().sort();
    ids.forEach((nid, index) => {
      positions[nid] = { x: index * gapX, y: r * gapY };
    });
  }

  return ok({ positions });
}
