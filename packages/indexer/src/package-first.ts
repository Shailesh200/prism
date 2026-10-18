import type { FileInventoryEntry } from "@repo-prism/shared";

/**
 * Prefer files under shallow package roots (dirs that contain package.json)
 * so a capped first index still covers the packages a newcomer opens first.
 *
 * Each file is owned by its deepest matching package root. Package roots are
 * visited shallow-first; within a package, paths sort lexicographically.
 *
 * Only entries that `counts` accepts (the analyzable code files) count toward
 * `max`; the others cost nothing to index and are always kept.
 */
export function prioritizePackageFirst(
  entries: readonly FileInventoryEntry[],
  max: number,
  counts: (entry: FileInventoryEntry) => boolean = () => true,
): FileInventoryEntry[] {
  if (max <= 0 || entries.filter(counts).length <= max) return [...entries];

  const packageRoots = [
    ...new Set(
      entries
        .map((entry) => entry.path.replace(/\\/g, "/"))
        .filter(
          (path) => path === "package.json" || path.endsWith("/package.json"),
        )
        .map((path) =>
          path === "package.json" ? "" : path.slice(0, -"/package.json".length),
        ),
    ),
  ].sort(
    (a, b) =>
      a.split("/").filter(Boolean).length -
        b.split("/").filter(Boolean).length || (a < b ? -1 : a > b ? 1 : 0),
  );

  const owningRoot = (path: string): string | null => {
    const norm = path.replace(/\\/g, "/");
    let best: string | null = null;
    let bestDepth = -1;
    for (const root of packageRoots) {
      const owned = root === "" || norm === root || norm.startsWith(`${root}/`);
      if (!owned) continue;
      const depth = root === "" ? 0 : root.split("/").filter(Boolean).length;
      if (depth > bestDepth) {
        bestDepth = depth;
        best = root;
      }
    }
    return best;
  };

  const byRoot = new Map<string | null, FileInventoryEntry[]>();
  for (const entry of entries) {
    const root = owningRoot(entry.path);
    const bucket = byRoot.get(root) ?? [];
    bucket.push(entry);
    byRoot.set(root, bucket);
  }
  for (const bucket of byRoot.values()) {
    bucket.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  const orderedRoots = [...packageRoots, ...(byRoot.has(null) ? [null] : [])];
  const out: FileInventoryEntry[] = [];
  let counted = 0;
  for (const root of orderedRoots) {
    for (const entry of byRoot.get(root) ?? []) {
      if (!counts(entry)) out.push(entry);
      else if (counted < max) {
        out.push(entry);
        counted += 1;
      }
    }
  }
  return out;
}
