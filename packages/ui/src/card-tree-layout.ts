import type { Edge, Node } from "@xyflow/react";
import type { TreeEntry, TreeEntryKind } from "./file-tree.js";

/** Match CSS card sizes in map.css (+ small safety pad). */
const CARD_SIZE: Record<TreeEntryKind, { w: number; h: number }> = {
  folder: { w: 208, h: 120 },
  file: { w: 260, h: 78 },
  symbol: { w: 208, h: 100 },
};

const GAP_X = 48;
const GAP_Y = 64;
/** Extra air between any two cards after layout (collision pass). */
const MIN_GAP = 24;

const edgeStyle = {
  type: "smoothstep" as const,
  style: {
    stroke: "rgba(15, 118, 110, 0.4)",
    strokeWidth: 1.5,
  },
};

export type CardTreeLayout = {
  readonly nodes: Node[];
  readonly edges: Edge[];
};

type LaidNode = {
  id: string;
  entry: TreeEntry;
  x: number;
  y: number;
  w: number;
  h: number;
  parentId: string | null;
  childIds: string[];
};

function cardSize(kind: TreeEntryKind): { w: number; h: number } {
  return CARD_SIZE[kind];
}

function childrenTotalWidth(
  children: readonly TreeEntry[],
  expanded: ReadonlySet<string>,
): number {
  if (children.length === 0) return 0;
  return children.reduce(
    (sum, child, index) =>
      sum + subtreeWidth(child, expanded) + (index > 0 ? GAP_X : 0),
    0,
  );
}

function subtreeWidth(entry: TreeEntry, expanded: ReadonlySet<string>): number {
  const self = cardSize(entry.kind).w;
  if (!expanded.has(entry.id) || entry.children.length === 0) {
    return self;
  }
  return Math.max(self, childrenTotalWidth(entry.children, expanded));
}

function collectDescendantIds(entry: TreeEntry, into: Set<string>): void {
  for (const child of entry.children) {
    into.add(child.id);
    collectDescendantIds(child, into);
  }
}

/** Collapse a node and every descendant expansion. */
export function collapseExpanded(
  expanded: ReadonlySet<string>,
  entry: TreeEntry,
): Set<string> {
  const next = new Set(expanded);
  next.delete(entry.id);
  const descendants = new Set<string>();
  collectDescendantIds(entry, descendants);
  for (const id of descendants) next.delete(id);
  return next;
}

export function toggleExpanded(
  expanded: ReadonlySet<string>,
  entry: TreeEntry,
): Set<string> {
  if (expanded.has(entry.id)) {
    return collapseExpanded(expanded, entry);
  }
  const next = new Set(expanded);
  next.add(entry.id);
  return next;
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap: number,
): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function collectSubtreeIds(
  byId: Map<string, LaidNode>,
  id: string,
  into: Set<string>,
): void {
  into.add(id);
  const node = byId.get(id);
  if (!node) return;
  for (const childId of node.childIds) {
    collectSubtreeIds(byId, childId, into);
  }
}

/**
 * Push overlapping cards apart (shift entire subtrees) until every pair
 * has at least MIN_GAP clearance. Guarantees no visual overlap.
 */
export function resolveCardOverlaps(laid: LaidNode[]): void {
  const byId = new Map(laid.map((n) => [n.id, n]));
  // Enough passes for deep trees; each pass fixes left-to-right conflicts.
  for (let pass = 0; pass < laid.length + 4; pass++) {
    let moved = false;
    const ordered = [...laid].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i]!;
        const b = ordered[j]!;
        if (!boxesOverlap(a, b, MIN_GAP)) continue;

        // Prefer shifting the right-hand (or lower) card's whole subtree.
        const left = a.x <= b.x ? a : b;
        const right = a.x <= b.x ? b : a;
        const needed = left.x + left.w + MIN_GAP - right.x;
        if (needed <= 0) continue;

        const shiftIds = new Set<string>();
        collectSubtreeIds(byId, right.id, shiftIds);
        for (const id of shiftIds) {
          const n = byId.get(id);
          if (n) n.x += needed;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** True when every pair of laid cards has ≥ gap clearance. */
export function cardsOverlap(
  nodes: readonly { x: number; y: number; w: number; h: number }[],
  gap = MIN_GAP,
): boolean {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (boxesOverlap(nodes[i]!, nodes[j]!, gap)) return true;
    }
  }
  return false;
}

/**
 * Lay out visible tree cards: roots in a row; expanded children below
 * their parent, linked by edges. Card sizes match CSS; a collision pass
 * keeps siblings/cousins from overlapping.
 */
export function layoutCardTree(
  roots: readonly TreeEntry[],
  expanded: ReadonlySet<string>,
  selectedId: string | null,
): CardTreeLayout {
  const laid: LaidNode[] = [];
  const edges: Edge[] = [];

  const place = (
    entry: TreeEntry,
    slotLeft: number,
    y: number,
    parentId: string | null,
  ) => {
    const size = cardSize(entry.kind);
    const treeW = subtreeWidth(entry, expanded);
    const x = slotLeft + Math.max(0, (treeW - size.w) / 2);
    const hasChildren = entry.children.length > 0;
    const isExpanded = expanded.has(entry.id);

    laid.push({
      id: entry.id,
      entry,
      x,
      y,
      w: size.w,
      h: size.h,
      parentId,
      childIds: [],
    });

    if (parentId) {
      const parent = laid.find((n) => n.id === parentId);
      parent?.childIds.push(entry.id);
      edges.push({
        id: `tree:${parentId}->${entry.id}`,
        source: parentId,
        target: entry.id,
        ...edgeStyle,
      });
    }

    if (!hasChildren || !isExpanded) return;

    const childTotal = childrenTotalWidth(entry.children, expanded);
    let cursor = slotLeft + Math.max(0, (treeW - childTotal) / 2);
    const childY = y + size.h + GAP_Y;

    for (const child of entry.children) {
      const cw = subtreeWidth(child, expanded);
      place(child, cursor, childY, entry.id);
      cursor += cw + GAP_X;
    }
  };

  // Pack top-level roots into wrapped rows so many folders don't become
  // one unreadably wide strip (same failure mode as overview zoom).
  const MAX_ROW_W = 5 * CARD_SIZE.file.w + 4 * GAP_X;
  let rowX = 0;
  let rowY = 0;
  let rowMaxH = 0;
  for (const root of roots) {
    const w = subtreeWidth(root, expanded);
    const size = cardSize(root.kind);
    const treeH =
      expanded.has(root.id) && root.children.length > 0
        ? size.h + GAP_Y + CARD_SIZE.folder.h // lower bound; collision pass fixes
        : size.h;
    if (rowX > 0 && rowX + w > MAX_ROW_W) {
      rowX = 0;
      rowY += rowMaxH + GAP_Y * 2;
      rowMaxH = 0;
    }
    place(root, rowX, rowY, null);
    rowX += w + GAP_X * 2;
    rowMaxH = Math.max(rowMaxH, treeH);
  }

  resolveCardOverlaps(laid);

  const nodes: Node[] = laid.map((n) => ({
    id: n.id,
    type: "prism",
    position: { x: n.x, y: n.y },
    style: { width: n.w, height: n.h },
    data: {
      label:
        n.entry.kind === "file"
          ? n.entry.path
          : n.entry.name || n.entry.path || "root",
      kind: n.entry.kind,
      selected: n.id === selectedId || n.entry.nodeId === selectedId,
      openable: n.entry.children.length > 0,
      expanded: expanded.has(n.id) && n.entry.children.length > 0,
      meta:
        n.entry.children.length > 0
          ? expanded.has(n.id)
            ? `${n.entry.children.length} open · double-click to close`
            : `${n.entry.kind === "folder" ? n.entry.fileCount : n.entry.children.length} inside · double-click`
          : n.entry.kind === "symbol"
            ? "Symbol"
            : undefined,
    },
  }));

  return { nodes, edges };
}
