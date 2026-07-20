import type { TreeEntry } from "./file-tree.js";

export type TreemapPointCustom = {
  path: string;
  nodeId?: string;
  kind: TreeEntry["kind"];
  fileCount: number;
  /** File-type tone when kind === "file". */
  fileTone?: string;
  fileLabel?: string;
};

export type TreemapPoint = {
  id: string;
  name: string;
  parent?: string;
  value?: number;
  colorValue?: number;
  color?: string;
  custom: TreemapPointCustom;
};

function entrySize(entry: TreeEntry): number {
  if (entry.kind === "file") return 1;
  if (entry.kind === "symbol") return 0.25;
  return Math.max(1, entry.fileCount);
}

function toPoint(entry: TreeEntry, parentId?: string): TreemapPoint {
  const kids = entry.children.filter((c) => c.kind !== "symbol");
  const size = entrySize(entry);
  const point: TreemapPoint = {
    id: entry.id,
    name: entry.name || entry.path || "root",
    custom: {
      path: entry.path,
      kind: entry.kind,
      fileCount: entry.kind === "file" ? 1 : entry.fileCount,
      ...(entry.nodeId === undefined ? {} : { nodeId: entry.nodeId }),
    },
    colorValue: size,
  };
  if (parentId !== undefined) point.parent = parentId;
  if (kids.length === 0 || parentId === undefined) {
    // Leaves always carry value; level-only parents also carry value so tiles size.
    point.value = size;
  }
  return point;
}

/**
 * One treemap level: immediate children only (no nested descendants).
 * Folder tiles size by descendant file count.
 */
export function treeLevelToTreemapPoints(
  entries: readonly TreeEntry[],
): TreemapPoint[] {
  return entries
    .filter((entry) => entry.kind !== "symbol")
    .map((entry) => toPoint(entry));
}

/** Flatten a file tree into Highcharts treemap points (parent/id links). */
export function treeEntriesToTreemapPoints(
  roots: readonly TreeEntry[],
): TreemapPoint[] {
  const points: TreemapPoint[] = [];

  const walk = (entry: TreeEntry, parentId: string | undefined) => {
    if (entry.kind === "symbol") return;
    const kids = entry.children.filter((c) => c.kind !== "symbol");
    const size = entrySize(entry);
    const point: TreemapPoint = {
      id: entry.id,
      name: entry.name || entry.path || "root",
      custom: {
        path: entry.path,
        kind: entry.kind,
        fileCount: entry.kind === "file" ? 1 : entry.fileCount,
        ...(entry.nodeId === undefined ? {} : { nodeId: entry.nodeId }),
      },
      colorValue: size,
    };
    if (parentId !== undefined) point.parent = parentId;
    // Leaves carry value; parents get summed from children by Highcharts.
    if (kids.length === 0) point.value = size;
    points.push(point);
    for (const child of kids) walk(child, entry.id);
  };

  for (const root of roots) walk(root, undefined);
  return points;
}

/** Find a folder/file entry by id under a root. */
export function findTreeEntry(
  root: TreeEntry,
  id: string,
): TreeEntry | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const hit = findTreeEntry(child, id);
    if (hit) return hit;
  }
  return undefined;
}

/** Breadcrumb trail from root → entry (inclusive). Root itself is omitted when empty. */
export function breadcrumbTrail(
  root: TreeEntry,
  currentId: string | null,
): TreeEntry[] {
  if (!currentId || currentId === root.id) return [];
  const trail: TreeEntry[] = [];
  const walk = (entry: TreeEntry): boolean => {
    if (entry.id === currentId) {
      trail.push(entry);
      return true;
    }
    for (const child of entry.children) {
      if (walk(child)) {
        trail.unshift(entry);
        return true;
      }
    }
    return false;
  };
  walk(root);
  // Drop synthetic empty root from crumbs.
  return trail.filter((e) => e.path !== "" || e.name !== "");
}
