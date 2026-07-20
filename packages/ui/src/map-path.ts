/** Split a repo-relative path for cartographic labels. */
export function splitRepoPath(label: string): {
  dir: string | null;
  name: string;
} {
  const normalized = label.replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  if (slash < 0) return { dir: null, name: normalized };
  return {
    dir: normalized.slice(0, slash + 1),
    name: normalized.slice(slash + 1),
  };
}

export function isPathKind(kind: string): boolean {
  return kind === "file" || kind === "symbol";
}
