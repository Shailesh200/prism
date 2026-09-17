/**
 * Rewrite memory `symbol` / `path` anchors after a rename (M-075 M1).
 * Pure — persist lives in `prism-home.migrateWorkspaceMemories`.
 */

export type MemoryAnchorChange = {
  readonly kind: "file" | "symbol";
  readonly from: string;
  readonly to: string;
};

export type MemoryAnchor = {
  readonly symbol?: string;
  readonly path?: string;
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

/**
 * Returns a new list. Unanchored items and non-matching anchors are unchanged
 * (same object identity). A file rename also rewrites a path prefix so a
 * directory move keeps child-file memories.
 */
export function rewriteMemoryAnchors<T extends MemoryAnchor>(
  items: readonly T[],
  change: MemoryAnchorChange,
): T[] {
  const from =
    change.kind === "file" ? normalizePath(change.from) : change.from;
  const to = change.kind === "file" ? normalizePath(change.to) : change.to;
  if (!from || !to || from === to) return [...items];

  return items.map((item) => {
    if (change.kind === "symbol") {
      if (item.symbol !== from) return item;
      return { ...item, symbol: to };
    }
    if (!item.path) return item;
    const path = normalizePath(item.path);
    if (path === from) return { ...item, path: to };
    if (path.startsWith(`${from}/`)) {
      return { ...item, path: `${to}${path.slice(from.length)}` };
    }
    return item;
  });
}
