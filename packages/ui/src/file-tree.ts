import type { GraphNodeDto } from "@repo-prism/shared";

export type TreeEntryKind = "folder" | "file" | "symbol";

export type TreeEntry = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly kind: TreeEntryKind;
  readonly children: TreeEntry[];
  /** Graph node id for selection (files / symbols). */
  readonly nodeId?: string;
  /** Descendant file count (folders). */
  readonly fileCount: number;
};

export type FileTreeIndex = {
  readonly root: TreeEntry;
  readonly fileCount: number;
  readonly folderCount: number;
  readonly symbolCount: number;
  /** path → graph node id */
  readonly byPath: ReadonlyMap<string, string>;
  /** graph node id → path */
  readonly byNodeId: ReadonlyMap<string, string>;
};

export type FlatTreeRow = {
  readonly entry: TreeEntry;
  readonly depth: number;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
};

type MutableEntry = {
  id: string;
  name: string;
  path: string;
  kind: TreeEntryKind;
  children: Map<string, MutableEntry>;
  nodeId?: string;
  fileCount: number;
};

function pathOf(node: GraphNodeDto): string | null {
  if (typeof node.attrs?.path === "string" && node.attrs.path.length > 0) {
    return node.attrs.path.replaceAll("\\", "/");
  }
  if (node.kind === "file") {
    return node.label.replaceAll("\\", "/");
  }
  return null;
}

function ensureFolder(root: MutableEntry, dirPath: string): MutableEntry {
  if (!dirPath) return root;
  const parts = dirPath.split("/").filter(Boolean);
  let cur = root;
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    let next = cur.children.get(part);
    if (!next) {
      next = {
        id: `folder:${acc}`,
        name: part,
        path: acc,
        kind: "folder",
        children: new Map(),
        fileCount: 0,
      };
      cur.children.set(part, next);
    }
    cur = next;
  }
  return cur;
}

function freeze(entry: MutableEntry): TreeEntry {
  const children = [...entry.children.values()]
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        if (a.kind === "folder") return -1;
        if (b.kind === "folder") return 1;
        if (a.kind === "file") return -1;
        if (b.kind === "file") return 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map(freeze);

  const fileCount =
    entry.kind === "file"
      ? 1
      : children.reduce(
          (sum, c) => sum + (c.kind === "file" ? 1 : c.fileCount),
          0,
        );

  return {
    id: entry.id,
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    children,
    fileCount,
    ...(entry.nodeId === undefined ? {} : { nodeId: entry.nodeId }),
  };
}

/**
 * Build an IDE-style folder tree (+ optional symbols) from map graph nodes.
 */
export function buildFileTreeIndex(
  nodes: readonly GraphNodeDto[],
): FileTreeIndex {
  const root: MutableEntry = {
    id: "folder:",
    name: "",
    path: "",
    kind: "folder",
    children: new Map(),
    fileCount: 0,
  };
  const byPath = new Map<string, string>();
  const byNodeId = new Map<string, string>();
  let fileCount = 0;
  let symbolCount = 0;

  const files = nodes.filter((n) => n.kind === "file");
  const symbols = nodes.filter((n) => n.kind === "symbol");

  for (const file of files) {
    const path = pathOf(file);
    if (!path) continue;
    const slash = path.lastIndexOf("/");
    const dir = slash >= 0 ? path.slice(0, slash) : "";
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const parent = ensureFolder(root, dir);
    if (parent.children.has(name)) continue;
    parent.children.set(name, {
      id: `file:${path}`,
      name,
      path,
      kind: "file",
      children: new Map(),
      nodeId: file.id,
      fileCount: 1,
    });
    byPath.set(path, file.id);
    byNodeId.set(file.id, path);
    fileCount += 1;
  }

  for (const sym of symbols) {
    const path =
      typeof sym.attrs?.path === "string"
        ? sym.attrs.path.replaceAll("\\", "/")
        : null;
    if (!path) continue;
    const slash = path.lastIndexOf("/");
    const dir = slash >= 0 ? path.slice(0, slash) : "";
    const fileName = slash >= 0 ? path.slice(slash + 1) : path;
    const parent = ensureFolder(root, dir);
    const existing = parent.children.get(fileName);
    let fileEntry: MutableEntry;
    if (existing && existing.kind === "file") {
      fileEntry = existing;
    } else {
      const existingId = byPath.get(path);
      fileEntry = {
        id: `file:${path}`,
        name: fileName,
        path,
        kind: "file",
        children: new Map(),
        fileCount: 1,
        ...(existingId === undefined ? {} : { nodeId: existingId }),
      };
      parent.children.set(fileName, fileEntry);
      if (existingId === undefined) {
        fileCount += 1;
      }
    }
    fileEntry.children.set(sym.id, {
      id: `symbol:${sym.id}`,
      name: sym.label,
      path: `${path}#${sym.label}`,
      kind: "symbol",
      children: new Map(),
      nodeId: sym.id,
      fileCount: 0,
    });
    byNodeId.set(sym.id, path);
    symbolCount += 1;
  }

  const frozen = freeze(root);
  let folderCount = 0;
  const walk = (e: TreeEntry) => {
    if (e.kind === "folder" && e.path) folderCount += 1;
    for (const c of e.children) walk(c);
  };
  walk(frozen);

  return {
    root: frozen,
    fileCount,
    folderCount,
    symbolCount,
    byPath,
    byNodeId,
  };
}

/** Top-level folder ids to expand by default (shallow IDE open). */
export function defaultExpandedIds(root: TreeEntry): Set<string> {
  const open = new Set<string>();
  for (const child of root.children) {
    if (child.kind === "folder") open.add(child.id);
  }
  return open;
}

/** Folder ids that must be open to reveal a node or path. */
export function expandPathTo(
  root: TreeEntry,
  target: { path?: string; nodeId?: string },
): string[] {
  const ids: string[] = [];

  const find = (e: TreeEntry): boolean => {
    if (target.nodeId && e.nodeId === target.nodeId) return true;
    if (target.path && e.path === target.path) return true;
    for (const c of e.children) {
      if (find(c)) {
        if (e.kind === "folder" && e.path) ids.push(e.id);
        return true;
      }
    }
    return false;
  };

  find(root);
  return ids;
}

export function flattenVisible(
  root: TreeEntry,
  expanded: ReadonlySet<string>,
  filterQuery = "",
): FlatTreeRow[] {
  const q = filterQuery.trim().toLowerCase();
  const rows: FlatTreeRow[] = [];

  const matches = (e: TreeEntry): boolean => {
    if (!q) return true;
    if (e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q)) {
      return true;
    }
    return e.children.some(matches);
  };

  const walk = (e: TreeEntry, depth: number) => {
    for (const child of e.children) {
      if (q && !matches(child)) continue;
      const hasChildren = child.children.length > 0;
      const isOpen = q ? hasChildren : expanded.has(child.id);
      rows.push({
        entry: child,
        depth,
        expanded: isOpen && hasChildren,
        hasChildren,
      });
      if (hasChildren && isOpen) {
        walk(child, depth + 1);
      }
    }
  };

  walk(root, 0);
  return rows;
}
