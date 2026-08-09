/**
 * Label-propagation community detection over an undirected edge list (M-061).
 * Deterministic: nodes sorted, labels updated in sorted order each pass.
 */

export type CommunityEdge = {
  readonly from: string;
  readonly to: string;
};

export type LabelPropagationOptions = {
  /** Max synchronous iterations (default 20). */
  readonly maxIterations?: number;
  /** Drop communities smaller than this (default 2). */
  readonly minCommunitySize?: number;
};

export type CommunityPartition = {
  /** node id → community id (stable label = lexicographically smallest member). */
  readonly membership: ReadonlyMap<string, string>;
  /** community id → member node ids (sorted). */
  readonly communities: ReadonlyMap<string, readonly string[]>;
};

/**
 * Asynchronous-style label propagation on an undirected graph.
 * Isolated nodes form singleton communities (filtered by minCommunitySize).
 */
export function labelPropagationCommunities(
  nodeIds: readonly string[],
  edges: readonly CommunityEdge[],
  options: LabelPropagationOptions = {},
): CommunityPartition {
  const maxIterations = options.maxIterations ?? 20;
  const minCommunitySize = options.minCommunitySize ?? 2;

  const nodeSet = new Set<string>(nodeIds);
  for (const e of edges) {
    nodeSet.add(e.from);
    nodeSet.add(e.to);
  }
  const nodes = [...nodeSet].sort((a, b) => a.localeCompare(b));

  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n, new Set());

  for (const e of edges) {
    if (e.from === e.to) continue;
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }

  const label = new Map<string, string>();
  for (const n of nodes) label.set(n, n);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (const n of nodes) {
      const neighbors = adj.get(n);
      if (!neighbors || neighbors.size === 0) continue;

      const counts = new Map<string, number>();
      for (const nb of neighbors) {
        const lab = label.get(nb) ?? nb;
        counts.set(lab, (counts.get(lab) ?? 0) + 1);
      }

      const ranked = [...counts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      });
      if (ranked.length === 0) continue;
      const bestLabel = ranked[0]![0];
      if (bestLabel !== label.get(n)) {
        label.set(n, bestLabel);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    const lab = label.get(n) ?? n;
    const list = groups.get(lab) ?? [];
    list.push(n);
    groups.set(lab, list);
  }

  const membership = new Map<string, string>();
  const communities = new Map<string, readonly string[]>();
  for (const members of groups.values()) {
    members.sort((a, b) => a.localeCompare(b));
    if (members.length < minCommunitySize) continue;
    const id = members[0]!;
    communities.set(id, members);
    for (const m of members) membership.set(m, id);
  }

  return { membership, communities };
}
