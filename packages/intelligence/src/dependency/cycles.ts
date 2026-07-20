/**
 * Directed cycle detection via Tarjan SCCs.
 * Returns cycles as node-id lists (length ≥ 2, or self-loops of length 1).
 * Deterministic: SCCs and nodes within each cycle sorted lexicographically;
 * cycles sorted by joined id string.
 */

export function findCycles(
  nodeIds: readonly string[],
  edges: ReadonlyArray<{ from: string; to: string }>,
): string[][] {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue;
    const list = adj.get(e.from)!;
    if (!list.includes(e.to)) list.push(e.to);
  }
  for (const list of adj.values()) list.sort((a, b) => a.localeCompare(b));

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      sccs.push(scc);
    }
  }

  const sortedIds = [...nodeIds].sort((a, b) => a.localeCompare(b));
  for (const v of sortedIds) {
    if (!indices.has(v)) strongConnect(v);
  }

  const cycles: string[][] = [];
  for (const scc of sccs) {
    if (scc.length > 1) {
      cycles.push([...scc].sort((a, b) => a.localeCompare(b)));
      continue;
    }
    const only = scc[0]!;
    if ((adj.get(only) ?? []).includes(only)) {
      cycles.push([only]);
    }
  }

  return cycles.sort((a, b) => a.join("\0").localeCompare(b.join("\0")));
}
