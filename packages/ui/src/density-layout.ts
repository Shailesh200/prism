import type { TreeEntry } from "./file-tree.js";

export type DensityMode = "treemap" | "icicle";

export type DensityRect = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly kind: TreeEntry["kind"];
  readonly size: number;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly nodeId?: string;
};

function entrySize(entry: TreeEntry): number {
  if (entry.kind === "file") return 1;
  if (entry.kind === "symbol") return 0.25;
  return Math.max(1, entry.fileCount);
}

/**
 * Nested slice-and-dice treemap.
 * Folders keep a header strip; children fill the remaining area.
 */
export function layoutTreemap(
  roots: readonly TreeEntry[],
  width: number,
  height: number,
): DensityRect[] {
  const out: DensityRect[] = [];

  const place = (
    entries: readonly TreeEntry[],
    x: number,
    y: number,
    w: number,
    h: number,
    depth: number,
    vertical: boolean,
  ) => {
    if (entries.length === 0 || w < 2 || h < 2) return;
    const total = entries.reduce((sum, e) => sum + entrySize(e), 0);
    if (total <= 0) return;

    let cursor = vertical ? y : x;
    for (const entry of entries) {
      const fraction = entrySize(entry) / total;
      const span = (vertical ? h : w) * fraction;
      const rx = vertical ? x : cursor;
      const ry = vertical ? cursor : y;
      const rw = vertical ? w : span;
      const rh = vertical ? span : h;
      const kids = entry.children.filter((c) => c.kind !== "symbol");

      out.push({
        id: entry.id,
        name: entry.name || entry.path || "root",
        path: entry.path,
        kind: entry.kind,
        size: entrySize(entry),
        depth,
        x: rx,
        y: ry,
        w: Math.max(0, rw),
        h: Math.max(0, rh),
        ...(entry.nodeId === undefined ? {} : { nodeId: entry.nodeId }),
      });

      if (kids.length > 0 && rw > 20 && rh > 28) {
        const header = Math.min(18, Math.max(14, rh * 0.16));
        const pad = 2;
        place(
          kids,
          rx + pad,
          ry + header,
          Math.max(0, rw - pad * 2),
          Math.max(0, rh - header - pad),
          depth + 1,
          !vertical,
        );
      }

      cursor += span;
    }
  };

  place(roots, 0, 0, width, height, 0, width >= height);
  return out;
}

/** Icicle: each depth is a horizontal band; width ∝ size. */
export function layoutIcicle(
  roots: readonly TreeEntry[],
  width: number,
  height: number,
  maxDepth = 6,
): DensityRect[] {
  const out: DensityRect[] = [];

  const maxD = (() => {
    let m = 0;
    const walk = (entries: readonly TreeEntry[], depth: number) => {
      m = Math.max(m, depth);
      if (depth >= maxDepth) return;
      for (const e of entries) {
        const kids = e.children.filter((c) => c.kind !== "symbol");
        if (kids.length > 0) walk(kids, depth + 1);
      }
    };
    walk(roots, 0);
    return Math.min(maxDepth, m);
  })();

  const levels = maxD + 1;
  const rowH = height / levels;

  const placeLevel = (
    entries: readonly TreeEntry[],
    y: number,
    x0: number,
    x1: number,
    depth: number,
  ) => {
    const total = entries.reduce((sum, e) => sum + entrySize(e), 0);
    if (total <= 0 || x1 <= x0) return;
    let x = x0;
    for (const entry of entries) {
      const w = ((x1 - x0) * entrySize(entry)) / total;
      out.push({
        id: entry.id,
        name: entry.name || entry.path || "root",
        path: entry.path,
        kind: entry.kind,
        size: entrySize(entry),
        depth,
        x,
        y,
        w: Math.max(0, w),
        h: Math.max(0, rowH - 1.5),
        ...(entry.nodeId === undefined ? {} : { nodeId: entry.nodeId }),
      });
      const kids = entry.children.filter((c) => c.kind !== "symbol");
      if (kids.length > 0 && depth < maxD) {
        placeLevel(kids, y + rowH, x, x + w, depth + 1);
      }
      x += w;
    }
  };

  placeLevel(roots, 0, 0, width, 0);
  return out;
}

export function layoutDensity(
  roots: readonly TreeEntry[],
  mode: DensityMode,
  width: number,
  height: number,
): DensityRect[] {
  return mode === "icicle"
    ? layoutIcicle(roots, width, height)
    : layoutTreemap(roots, width, height);
}
