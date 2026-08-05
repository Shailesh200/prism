import type { GraphNodeDto } from "@repo-prism/shared";
import { buildFileTreeIndex, type TreeEntry } from "./file-tree.js";

export type DrillScope = {
  readonly title: string;
  readonly kind: "folder" | "feature" | "package" | "file";
  /** Folder path prefix, or exact file path. */
  readonly pathPrefix?: string;
  /** Explicit allow-list of repo-relative paths (features). */
  readonly memberFiles?: readonly string[];
  readonly sourceNodeId: string;
};

/** Current folder (or file) whose children are shown as map cards. */
export type CardBrowse = {
  readonly folderPath: string;
  readonly rootLabel: string;
  readonly memberFiles?: readonly string[];
};

function nodePath(n: GraphNodeDto): string | null {
  if (typeof n.attrs?.path === "string")
    return n.attrs.path.replaceAll("\\", "/");
  if (n.kind === "file") return n.label.replaceAll("\\", "/");
  return null;
}

/** Synthetic file nodes for a feature member allow-list. */
export function nodesFromMemberFiles(
  memberFiles: readonly string[],
): GraphNodeDto[] {
  return memberFiles.map((path) => {
    const normalized = path.replaceAll("\\", "/");
    return {
      id: `file:${normalized}`,
      kind: "file" as const,
      label: normalized,
      attrs: { path: normalized },
    };
  });
}

/** Top-level folders/files as map cards (IDE roots), not every file. */
export function folderCardEntries(nodes: readonly GraphNodeDto[]): TreeEntry[] {
  return cardEntriesAt(nodes, "");
}

/** Children of a folder (or symbols under a file) as map cards. */
export function cardEntriesAt(
  nodes: readonly GraphNodeDto[],
  folderPath: string,
): TreeEntry[] {
  const index = buildFileTreeIndex(nodes);
  const normalized = folderPath.replaceAll("\\", "/");
  if (!normalized) return index.root.children;

  const find = (entry: TreeEntry): TreeEntry | undefined => {
    if (entry.path === normalized) return entry;
    for (const child of entry.children) {
      const hit = find(child);
      if (hit) return hit;
    }
    return undefined;
  };

  return find(index.root)?.children ?? [];
}

/** Find a tree entry by id anywhere in the file tree. */
export function findTreeEntryById(
  nodes: readonly GraphNodeDto[],
  id: string,
): TreeEntry | undefined {
  const index = buildFileTreeIndex(nodes);
  const walk = (entry: TreeEntry): TreeEntry | undefined => {
    if (entry.id === id) return entry;
    for (const child of entry.children) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(index.root);
}

export function parentFolderPath(folderPath: string): string | null {
  const normalized = folderPath.replaceAll("\\", "/");
  if (!normalized) return null;
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

/** Filter graph nodes to a drill scope for the explorer. */
export function scopeGraphNodes(
  nodes: readonly GraphNodeDto[],
  scope: DrillScope,
): GraphNodeDto[] {
  if (scope.memberFiles && scope.memberFiles.length > 0) {
    const allow = new Set(
      scope.memberFiles.map((p) => p.replaceAll("\\", "/")),
    );
    return nodes.filter((n) => {
      const p = nodePath(n);
      if (!p) return false;
      if (allow.has(p)) return true;
      // Keep symbols whose file is allowed.
      return n.kind === "symbol" && allow.has(p);
    });
  }

  const prefix = scope.pathPrefix?.replaceAll("\\", "/") ?? "";
  if (!prefix) return [...nodes];

  return nodes.filter((n) => {
    const p = nodePath(n);
    if (!p) return false;
    if (scope.kind === "file") return p === prefix;
    return p === prefix || p.startsWith(`${prefix}/`);
  });
}

export function drillScopeFromMapNode(node: GraphNodeDto): DrillScope | null {
  if (node.kind === "feature") {
    const members = node.attrs?.memberFiles;
    const memberFiles = Array.isArray(members)
      ? members.filter((m): m is string => typeof m === "string")
      : [];
    return {
      title: node.label,
      kind: "feature",
      sourceNodeId: node.id,
      ...(memberFiles.length > 0 ? { memberFiles } : {}),
    };
  }

  if (node.kind === "package") {
    const rootDir =
      typeof node.attrs?.rootDir === "string" ? node.attrs.rootDir : "";
    const prefix = rootDir === "." || rootDir === "" ? undefined : rootDir;
    return {
      title: node.label,
      kind: "package",
      sourceNodeId: node.id,
      ...(prefix === undefined ? {} : { pathPrefix: prefix }),
    };
  }

  if (node.kind === "folder" || node.id.startsWith("folder:")) {
    const path =
      typeof node.attrs?.path === "string"
        ? node.attrs.path
        : node.id.replace(/^folder:/, "");
    return {
      title: node.label,
      kind: "folder",
      sourceNodeId: node.id,
      pathPrefix: path,
    };
  }

  if (node.kind === "file") {
    const path = nodePath(node) ?? node.label;
    return {
      title: node.label,
      kind: "file",
      sourceNodeId: node.id,
      pathPrefix: path,
    };
  }

  return null;
}
